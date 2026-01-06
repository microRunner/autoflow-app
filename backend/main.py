import os
import io
import json
import uuid
import pandas as pd
import datetime
import google.generativeai as genai
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# --- SQLALCHEMY ---
from sqlalchemy import create_engine, Column, String, JSON, DateTime, Integer, Text, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# --- SCHEDULER ---
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

# --- CONFIGURATION ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("🚨 CRITICAL ERROR: GEMINI_API_KEY is missing from environment variables!")
else:
    genai.configure(api_key=GEMINI_API_KEY)

try:
    model = genai.GenerativeModel('gemini-3-pro-preview')
except Exception as e:
    print(f"⚠️ Model Warning: {e}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 1. DATABASES
# ==========================================
WORKFLOW_DB_URL = "sqlite:///./autoflow_config.db"
DATA_WAREHOUSE_URL = "sqlite:///./warehouse.db" 

workflow_engine = create_engine(WORKFLOW_DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=workflow_engine)
Base = declarative_base()

data_engine = create_engine(DATA_WAREHOUSE_URL, connect_args={"check_same_thread": False})

class WorkflowDB(Base):
    __tablename__ = "workflows"
    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    steps = Column(JSON) 
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class JobRunDB(Base):
    __tablename__ = "job_runs"
    id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, index=True)
    status = Column(String)
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    output_table = Column(String, nullable=True)
    error_msg = Column(Text, nullable=True)

Base.metadata.create_all(bind=workflow_engine)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

# --- SEEDING DUMMY DATA ---
def seed_dummy_data():
    """Forces a refresh of the warehouse data to fix schema mismatches."""
    print("🌱 Checking Data Warehouse...")
    try:
        with data_engine.connect() as conn:
            conn.execute(text("DROP TABLE IF EXISTS gl_transactions"))
            conn.execute(text("DROP TABLE IF EXISTS bank_statement"))
            
            df_gl = pd.DataFrame({
                "txn_id": [f"GL-{i}" for i in range(1001, 1021)],
                "date": pd.date_range(start="2024-01-01", periods=20),
                "amount": [100.50, 200.00, -50.00, 1200.00, 45.00] * 4,
                "description": ["Service Fee", "Consulting", "Refund", "Retainer", "Supplies"] * 4
            })
            df_gl.to_sql("gl_transactions", data_engine, index=False)

            df_bank = pd.DataFrame({
                "txn_id": [f"GL-{i}" for i in range(1001, 1018)], 
                "date": pd.date_range(start="2024-01-01", periods=17),
                "amount": [100.50, 200.00, -50.00, 1200.00, 45.00] * 3 + [100.50, 200.00],
                "bank_ref": ["REF-A", "REF-B", "REF-C", "REF-D", "REF-E"] * 3 + ["REF-F", "REF-G"]
            })
            df_bank.to_sql("bank_statement", data_engine, index=False)
            print("✅ Data Warehouse Seeded.")
    except Exception as e:
        print(f"⚠️ Seeding skipped or failed: {e}")

seed_dummy_data()

# ==========================================
# 2. SCHEDULER SETUP
# ==========================================
jobstores = { 'default': SQLAlchemyJobStore(url=WORKFLOW_DB_URL) }

# THIS IS THE FIX:
job_defaults = {
    'coalesce': True,             # If 10 runs were missed, just run ONCE to catch up
    'max_instances': 1,           # Prevent duplicate runs
    'misfire_grace_time': 3600    # Allow the job to be up to 1 HOUR late and still run
}

scheduler = BackgroundScheduler(jobstores=jobstores, job_defaults=job_defaults)
scheduler.start()

# ==========================================
# 3. SERVER-SIDE RUNNER 
# ==========================================
def execute_workflow_server_side(workflow_id: str):
    db = SessionLocal()
    run_id = f"run_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
    job = JobRunDB(id=run_id, workflow_id=workflow_id, status="RUNNING")
    db.add(job)
    db.commit()
    print(f"⏰ [Scheduler] Started Run {run_id}")

    try:
        workflow = db.query(WorkflowDB).filter(WorkflowDB.id == workflow_id).first()
        if not workflow: raise Exception("Workflow not found")

        context_datasets = {}
        insp = inspect(data_engine)
        for table in insp.get_table_names():
            if not table.startswith("run_") and not table.startswith("temp_") and not table.startswith("final_"): 
                try:
                    df = pd.read_sql(f"SELECT * FROM {table}", data_engine)
                    context_datasets[f"df_{table}"] = df
                except: pass

        final_table_name = None
        for i, step in enumerate(workflow.steps):
            local_vars = {**context_datasets, 'pd': pd}
            exec(step['code'], {}, local_vars)
            
            if 'df_result' in local_vars:
                result_df = local_vars['df_result']
                context_datasets[f"df_step_{step['numericId']}"] = result_df
                
                is_final = (i == len(workflow.steps) - 1)
                table_name = f"{run_id}_final" if is_final else f"{run_id}_step_{step['numericId']}"
                result_df.to_sql(table_name, data_engine, if_exists='replace', index=False)
                if is_final: final_table_name = table_name

        job.status = "COMPLETED"
        job.end_time = datetime.datetime.utcnow()
        job.output_table = final_table_name
        print(f"✅ Success. Output: {final_table_name}")

    except Exception as e:
        print(f"❌ Failed: {e}")
        job.status = "FAILED"
        job.end_time = datetime.datetime.utcnow()
        job.error_msg = str(e)
    
    finally:
        db.commit()
        db.close()

# ==========================================
# 4. API ENDPOINTS
# ==========================================

class ScheduleRequest(BaseModel):
    workflow_id: str
    type: str 
    value: str 

class ProcessMultiRequest(BaseModel):
    datasets: Dict[str, List[Dict[str, Any]]]
    prompt: str
    task_type: Optional[str] = "GENERAL"

class ExecuteMultiRequest(BaseModel):
    datasets: Dict[str, List[Dict[str, Any]]]
    code: str

class StepModel(BaseModel):
    id: str
    numericId: int
    inputIds: List[str]
    prompt: str
    code: str
    data: List[Dict[str, Any]] = []

class WorkflowSaveRequest(BaseModel):
    name: str
    steps: List[StepModel]

class LoadTableRequest(BaseModel):
    table_name: str

class SaveTableRequest(BaseModel):
    table_name: str
    data: List[Dict[str, Any]]
    if_exists: str = "replace"

def sanitize_code(code_text: str) -> str:
    return code_text.replace("```python", "").replace("```", "").strip()

def run_python_logic(datasets_map: Dict[str, pd.DataFrame], prompt: str = None, code: str = None, task_type: str = "GENERAL") -> Dict[str, Any]:
    executable_code = code
    if not executable_code:
        buffer = io.StringIO()
        info_str = ""
        for name, df in datasets_map.items():
            buffer.truncate(0); buffer.seek(0)
            df.info(buf=buffer)
            info_str += f"\n--- DataFrame: '{name}' ---\n{buffer.getvalue()}\n"

        if task_type == "RECON":
            gemini_prompt = f"""
            You are a strict Financial Reconciliation Agent.
            YOUR MISSION: Compare datasets.
            1. ALWAYS use 'outer' join on keys.
            2. Fill NaNs in Measure columns with 0.0.
            3. Calculate Difference (Left - Right).
            4. Output MUST be in 'df_result'.
            Context: {info_str}
            User Instruction: {prompt}
            Return ONLY Python code.
            """
        else:
            gemini_prompt = f"""
            You are a Python Data Expert.
            Context: {info_str}
            User Request: {prompt}
            Requirement: Store result in 'df_result'.
            Return ONLY Python code.
            """
        try:
            response = model.generate_content(gemini_prompt)
            executable_code = sanitize_code(response.text)
        except Exception as e:
            raise ValueError(f"Gemini API Error: {str(e)}")

    local_vars = {**datasets_map, 'pd': pd}
    print(f"--- Executing ({task_type}) ---\n{executable_code}\n----------------")

    try:
        exec(executable_code, {}, local_vars)
    except Exception as e:
        print(f"❌ Execution Error: {str(e)}")
        raise ValueError(f"Code execution failed: {str(e)}")
    
    if 'df_result' not in local_vars:
        raise ValueError("Code executed but 'df_result' was not created.")
        
    result_df = local_vars['df_result']
    if isinstance(result_df, pd.Series): result_df = result_df.to_frame()
    elif not isinstance(result_df, pd.DataFrame): result_df = pd.DataFrame({'result': [result_df] if not isinstance(result_df, list) else result_df})
    
    result_df = result_df.reset_index()
    cols_to_drop = [c for c in result_df.columns if c in ['index', 'level_0', 'Unnamed: 0']]
    if cols_to_drop: result_df = result_df.drop(columns=cols_to_drop)
    result_df = result_df.fillna("NaN")
    
    return { "result": result_df.to_dict(orient="records"), "code": executable_code }

# --- NEW: UPLOAD ENDPOINT ---
@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    """Accepts a CSV file, reads it, and returns the data."""
    try:
        content = await file.read()
        df = pd.read_csv(io.StringIO(content.decode('utf-8')))
        df = df.fillna("NaN") # Handle NaNs for JSON
        return {"filename": file.filename, "data": df.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process CSV: {str(e)}")

@app.get("/db/tables")
async def list_tables():
    insp = inspect(data_engine)
    return {"tables": insp.get_table_names()}

@app.post("/db/load")
async def load_table(request: LoadTableRequest):
    try:
        query = f"SELECT * FROM {request.table_name} LIMIT 1000"
        df = pd.read_sql(query, data_engine)
        df = df.fillna("")
        return {"name": request.table_name, "data": df.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/db/save")
async def save_table_to_db(request: SaveTableRequest):
    try:
        if not request.data: return {"message": "No data", "rows": 0}
        df = pd.DataFrame(request.data)
        safe_table_name = "".join([c for c in request.table_name if c.isalnum() or c == "_"])
        df.to_sql(safe_table_name, data_engine, if_exists=request.if_exists, index=False)
        return {"message": f"Saved '{safe_table_name}'", "rows": len(df)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process_multi")
async def process_multi(request: ProcessMultiRequest):
    try:
        dfs = {name: pd.DataFrame(data) for name, data in request.datasets.items()}
        return run_python_logic(dfs, prompt=request.prompt, task_type=request.task_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/execute_multi")
async def execute_multi(request: ExecuteMultiRequest):
    try:
        dfs = {name: pd.DataFrame(data) for name, data in request.datasets.items()}
        return run_python_logic(dfs, code=request.code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/workflows")
async def get_workflows(db: Session = Depends(get_db)):
    return db.query(WorkflowDB).all()

@app.post("/workflows")
async def save_workflow(request: WorkflowSaveRequest, db: Session = Depends(get_db)):
    steps_data = [step.dict() for step in request.steps]
    new_workflow = WorkflowDB(id=str(uuid.uuid4())[:8], name=request.name, steps=steps_data)
    db.add(new_workflow)
    db.commit()
    db.refresh(new_workflow)
    return {"message": "Saved", "id": new_workflow.id}

@app.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    workflow = db.query(WorkflowDB).filter(WorkflowDB.id == workflow_id).first()
    if not workflow: 
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    for job in scheduler.get_jobs():
        if job.args and job.args[0] == workflow_id:
            try:
                scheduler.remove_job(job.id)
            except Exception as e: pass

    db.delete(workflow)
    db.commit()
    return {"message": "Deleted"}

@app.get("/schedules")
async def list_schedules():
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "next_run": str(job.next_run_time),
            "workflow_id": job.args[0] if job.args else "unknown",
            "trigger": str(job.trigger)
        })
    return jobs

@app.post("/schedules")
async def create_schedule(request: ScheduleRequest):
    try:
        if request.type == 'interval':
            job = scheduler.add_job(execute_workflow_server_side, 'interval', minutes=int(request.value), args=[request.workflow_id])
        elif request.type == 'daily':
            h, m = map(int, request.value.split(':'))
            job = scheduler.add_job(execute_workflow_server_side, 'cron', hour=h, minute=m, args=[request.workflow_id])
        else: raise ValueError("Invalid type")
        return {"message": "Scheduled", "job_id": job.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/schedules/{job_id}")
async def delete_schedule(job_id: str):
    try: scheduler.remove_job(job_id); return {"message": "Schedule removed"}
    except: raise HTTPException(status_code=404, detail="Job not found")

@app.get("/schedules/history/{workflow_id}")
async def get_run_history(workflow_id: str, db: Session = Depends(get_db)):
    runs = db.query(JobRunDB).filter(JobRunDB.workflow_id == workflow_id).order_by(JobRunDB.start_time.desc()).limit(20).all()
    return runs