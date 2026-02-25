
import requests
import json

UAZ_BASE = "https://backstagefy.uazapi.com"
ADMIN_TOKEN = "OGBLC86mcq9yDY9B2BR3Y2735GTOn7TJDA9rqpqb6t8loN67SV"
INSTANCE_NAME = "sp_e9cd10dd"

def diag():
    print(f"--- Diag for {INSTANCE_NAME} ---")
    
    # 1. Check all instances
    try:
        res = requests.get(f"{UAZ_BASE}/instance/all", headers={"admintoken": ADMIN_TOKEN})
        print(f"Status /instance/all: {res.status_code}")
        if res.status_code == 200:
            instances = res.json()
            found = next((i for i in instances if i.get('name') == INSTANCE_NAME or i.get('instanceName') == INSTANCE_NAME), None)
            if found:
                print(f"Found Instance: {found}")
                token = found.get('token')
                
                # 2. Check individual status
                s_res = requests.get(f"{UAZ_BASE}/instance/status", headers={"token": token})
                print(f"Individual Status: {s_res.status_code} - {s_res.text}")
                
                # 3. Check Webhook
                w_res = requests.get(f"{UAZ_BASE}/webhook", headers={"token": token})
                print(f"Webhook Status: {w_res.status_code} - {w_res.text}")
                
                # 4. Try to re-set it if it's wrong
                target_url = "https://fpqpnztwhkcrytprhyhe.supabase.co/functions/v1/ai-concierge-v5-final"
                print(f"Target URL: {target_url}")
                
                # Test set webhook
                set_res = requests.post(f"{UAZ_BASE}/webhook", headers={"token": token}, json={
                    "url": target_url,
                    "enabled": True,
                    "events": ["message", "messages.upsert", "chat.upsert"]
                })
                print(f"Reset Webhook result: {set_res.status_code} - {set_res.text}")

            else:
                print("Instance NOT FOUND in list.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    diag()
