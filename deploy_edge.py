import json

files_data = []
for fn in ['index.ts', 'decrypt_media.ts', 'query_leads.ts']:
    path = f'd:\\SP House\\sphaus-dashboard\\supabase\\functions\\ai-concierge-v5-final\\{fn}'
    with open(path, 'r', encoding='utf-8') as f:
        files_data.append({'name': fn, 'content': f.read()})

# Output as JSON for MCP tool
with open('d:\\SP House\\deploy_payload.json', 'w', encoding='utf-8') as f:
    json.dump(files_data, f)

print("Files ready:")
for fd in files_data:
    print(f"  {fd['name']}: {len(fd['content'])} chars")
