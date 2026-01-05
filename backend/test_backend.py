import requests

# 1. Setup the URL
url = "http://localhost:8080/process"

# 2. Create a dummy CSV in memory
csv_content = """Category,Sales,Date
A,100,2023-01-01
B,200,2023-01-02
A,150,2023-01-03
"""

# 3. Define the payload
files = {
    'file': ('test.csv', csv_content, 'text/csv')
}
data = {
    'prompt': 'Group by Category and sum the Sales'
}

print(f"Sending request to {url}...")

try:
    response = requests.post(url, files=files, data=data)
    
    # 4. Print the result
    if response.status_code == 200:
        response_data = response.json()
        print("✅ SUCCESS!")
        print("\n--- Generated Code ---")
        print(response_data.get("code", "Code not found in response."))
        print("\n--- Result Data ---")
        print(response_data.get("result", "Result not found in response."))
    else:
        print(f"❌ FAILED with Status Code: {response.status_code}")
        print("Error Details:", response.text)

except Exception as e:
    print(f"❌ Connection Error: {e}")
    print("Is the backend running?")