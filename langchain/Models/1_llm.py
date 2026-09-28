from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

llm = ChatGoogleGenerativeAI(model="gemini-3.8-flash", temperature=0.7, max_output_tokens=1024)
res = llm.invoke("Capital of France?")
print(res)
