from langchain_core.indexing import index
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from dotenv import load_dotenv
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

load_dotenv()

embedding = HuggingFaceEndpointEmbeddings(model="sentence-transformers/all-MiniLM-L6-v2")

documents = ["Virat Kohli is a famous Indian cricketer. He is known for his aggressive batting style and numerous records in international cricket.",
"Sachin Tendulkar is another legendary Indian cricketer, often regarded as one of the greatest batsmen in the history of cricket.",
"Rohit Sharma is known for his elegant batting technique and holds the record for the highest individual score in One Day Internationals.",
"MS Dhoni is celebrated for his exceptional leadership and finishing abilities in limited-overs cricket."
, "Jasprit Bumrah is known for his exceptional fast bowling skills and has been a key player for the Indian cricket team in international matches."]

query = "Who is known for his exceptional fast bowling skills in the Indian cricket team?"

doc_embeddings = embedding.embed_documents(documents)
query_embedding = embedding.embed_query(query)

scores = cosine_similarity([query_embedding], doc_embeddings)[0]

print("Similarities:", scores)

index, scores = zip(*sorted(enumerate(scores), key=lambda x: x[1], reverse=True))

most_similar_document = documents[index[0]]
print("Most similar document:", most_similar_document)


