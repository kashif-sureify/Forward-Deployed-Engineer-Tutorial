from langchain_huggingface import ChatHuggingFace, HuggingFacePipeline
from dotenv import load_dotenv

load_dotenv()

llm = HuggingFacePipeline.from_model_id(
    model_id="Qwen/Qwen3-0.6B",
    task="text-generation",
    pipeline_kwargs=dict(
        temperature=1.5,
        max_new_tokens=500,
        do_sample=True,
    ),
)

model = ChatHuggingFace(llm=llm)
res = model.invoke("Tell me a joke.")
print(res.content)