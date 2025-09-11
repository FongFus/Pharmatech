import chromadb

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_collection("pharmatech_collection")
results = collection.get()
print(results)