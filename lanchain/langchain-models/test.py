from langserve import RemoteRunnable

chain = RemoteRunnable("http://localhost:8000/translate/c/N4XyA")
res = chain.invoke({"text": "Hello, how are you?", "language": "french"})
print(res)