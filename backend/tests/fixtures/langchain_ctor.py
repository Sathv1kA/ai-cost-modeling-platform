"""Fixture: LangChain ChatOpenAI constructor + .invoke — should attribute invoke to langchain + gpt-4o-mini."""
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

result = llm.invoke("Explain closures in Python in one paragraph.")
print(result.content)
