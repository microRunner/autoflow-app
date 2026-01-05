# ⚡️ AutoFlow: AI-Powered Financial Reconciliation

AutoFlow is a low-code/no-code automation platform designed to simplify complex financial data workflows. It leverages Generative AI (Google Gemini) to transform natural language instructions into executable Python logic, enabling users to reconcile bank statements, general ledgers, and other datasets without writing a single line of code.

## 🚀 Features

-   **Natural Language Transformation:** Simply type *"Match rows where ID equals TransactionID"* and let the AI generate the Pandas code.
-   **Visual Workflow Builder:** Intuitive node-based interface to chain multiple data transformation stages together.
-   **Smart Modules:** Pre-configured AI agents for specific tasks like Reconciliation, Deduplication, and Variance Analysis.
-   **Automated Scheduling:** Built-in cron scheduler to run workflows automatically (hourly, daily, etc.).
-   **Full Audit Trail:** Comprehensive logging of every execution, preserving the generated code, input data snapshot, and final output tables.

## 🛠 Tech Stack

### **Frontend**
-   **Framework:** React 18
-   **Visualization:** React Flow (DAG/Graph View)
-   **Styling:** CSS Modules
-   **Build Tool:** Vite

### **Backend**
-   **API:** FastAPI (Python 3.11)
-   **AI Engine:** Google Gemini Pro
-   **Data Processing:** Pandas, NumPy, SQLAlchemy
-   **Database:** SQLite (Separated Configuration & Data Warehouse)
-   **Scheduler:** APScheduler

### **Infrastructure**
-   **Containerization:** Docker (Multi-stage builds)
-   **Cloud Provider:** Google Cloud Platform (Cloud Run)
-   **CI/CD:** Google Cloud Build

## 📦 Installation & Local Development

### Prerequisites
-   Node.js 18+
-   Python 3.11+
-   Google Cloud Project with Vertex AI enabled (optional)
-   Gemini API Key

### 1. Clone the Repository
```bash
git clone [https://github.com/YOUR_USERNAME/autoflow-app.git](https://github.com/YOUR_USERNAME/autoflow-app.git)
cd autoflow-app
```

### 2. Backend Setup
```bash
cd Backend
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt

# Run the server
export GEMINI_API_KEY="your_actual_api_key_here"
uvicorn main:app --reload --port 8080
```

### 3. Frontend Setup
```bash
cd Frontend
npm install
npm run dev
```
The application will be accessible at `http://localhost:5173`.

## ☁️ Deployment (Google Cloud)

This project is optimized for serverless deployment on **Google Cloud Run**.

### Deploy Backend
```bash
cd Backend
gcloud builds submit --tag gcr.io/PROJECT_ID/autoflow-backend
gcloud run deploy autoflow-backend \
  --image gcr.io/PROJECT_ID/autoflow-backend \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --set-env-vars GEMINI_API_KEY="your_key"
```

### Deploy Frontend
```bash
cd Frontend
gcloud builds submit --tag gcr.io/PROJECT_ID/autoflow-frontend
gcloud run deploy autoflow-frontend \
  --image gcr.io/PROJECT_ID/autoflow-frontend \
  --platform managed \
  --allow-unauthenticated
```

## 🛡 License

© 2026 Rahil Gupta. All Rights Reserved.

## 🤝 Contributing

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request