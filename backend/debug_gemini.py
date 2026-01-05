import google.generativeai as genai
import os
import sys

# --- PASTE YOUR KEY HERE ---
# Make sure this is the exact key from AI Studio
GEMINI_API_KEY = "AIzaSyC5VugF6364R4nbOoCjH_hJ-jMNNL7hVPc"

print(f"Python Version: {sys.version}")
print(f"Library Version: {genai.__version__}")

genai.configure(api_key=GEMINI_API_KEY)

print("\n--- ATTEMPTING TO LIST MODELS ---")
try:
    available_models = []
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"FOUND: {m.name}")
            available_models.append(m.name)
            
    if not available_models:
        print("❌ NO MODELS FOUND. This means your API Key is valid, but has no access to models.")
        print("   Solution: Enable 'Generative Language API' in Google Cloud Console.")
    else:
        print(f"\n✅ SUCCESS! You have access to {len(available_models)} models.")
        
        # Try to pick a winner
        target_model = 'models/gemini-1.5-flash'
        if target_model not in available_models:
            print(f"⚠️ {target_model} is missing. Switching to fallback...")
            target_model = available_models[0] # Pick the first available one
        
        print(f"--- TEST GENERATION WITH {target_model} ---")
        model = genai.GenerativeModel(target_model.replace('models/', ''))
        response = model.generate_content("Hello, are you working?")
        print(f"Response: {response.text}")

except Exception as e:
    print(f"\n❌ CRITICAL ERROR: {str(e)}")
    if "400" in str(e):
        print("   -> Your API Key is likely invalid or copied incorrectly.")
    if "403" in str(e):
        print("   -> You are in a blocked region or the API is not enabled.")