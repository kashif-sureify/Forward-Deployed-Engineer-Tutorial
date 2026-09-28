from langchain_google_genai import GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv

load_dotenv()

embedding = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

documents = ["India is a country in South Asia.", "The capital of France is Paris.", "Python is a popular programming language."]

result2 = embedding.embed_documents(documents)
print(len(result2))
print(result2[:5])

result = embedding.embed_query("Tell me a joke.")
print(len(result))
print(result[:5])
