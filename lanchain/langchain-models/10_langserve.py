import os
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_google_genai import GoogleGenerativeAI
from fastapi import FastAPI
from dotenv import load_dotenv, find_dotenv
from langserve import add_routes
import uvicorn

_ = load_dotenv(find_dotenv())
gemini_api_key = os.getenv("GEMINI_API_KEY")
gemini_model = os.getenv("GEMINI_MODEL")
model = GoogleGenerativeAI(api_key=gemini_api_key, model=gemini_model)
parser = StrOutputParser()

system_prompt = "You are a helpful assistant who can translate text accurately into different languages based on the parameters provided for language: {language}"

prompt = ChatPromptTemplate.from_messages([("system", system_prompt), ("user", "{text}")])

chain = prompt | model | parser


app = FastAPI(
    title="Language Translation API",
    description="API for translating text into different languages using Gemini model",
    version="1.0.0"
)

add_routes(app, chain, path="/translate")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)