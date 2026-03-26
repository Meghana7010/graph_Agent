import os
import json

BASE_PATH = "sap-o2c-data"  
OUTPUT_FILE = "server/data.json"

all_data = {}

for table in os.listdir(BASE_PATH):
    table_path = os.path.join(BASE_PATH, table)

    if os.path.isdir(table_path):
        records = []

        for file in os.listdir(table_path):
            if file.endswith(".jsonl"):
                file_path = os.path.join(table_path, file)

                with open(file_path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            records.append(json.loads(line))

        all_data[table] = records

os.makedirs("server", exist_ok=True)

with open(OUTPUT_FILE, "w") as f:
    json.dump(all_data, f)

print("✅ Data converted successfully!")
print("Tables:", list(all_data.keys()))
print("Total records:", sum(len(v) for v in all_data.values()))