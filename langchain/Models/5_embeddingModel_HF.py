from langchain_huggingface import HuggingFaceEndpointEmbeddings
from dotenv import load_dotenv

load_dotenv()

embedding = HuggingFaceEndpointEmbeddings(model="sentence-transformers/all-MiniLM-L6-v2")

documents = ["India is a country in South Asia.", "The capital of France is Paris.", "Python is a popular programming language."]

result2 = embedding.embed_documents(documents)
print(len(result2))
print(result2[0][:5])

result = embedding.embed_query("Tell me a joke.")
print(len(result))
print(result[:5])
