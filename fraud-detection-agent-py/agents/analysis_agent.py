import json
import os

import requests

ANALYSIS_SYSTEM_PROMPT = """You are a fraud detection analyst. You will be given a new transaction and a set of similar historical transactions (some fraudulent, some legitimate).

Analyze the new transaction and identify:
1. Risk indicators — patterns that suggest fraud
2. Trust signals — patterns that suggest legitimacy
3. Overall risk level: LOW, MEDIUM, or HIGH

Be concise. Focus on behavioral patterns, not just amounts.

Respond ONLY with valid JSON in this exact format:
{
  "risk_indicators": ["list of red flags"],
  "trust_signals": ["list of positive signals"],
  "risk_level": "LOW",
  "reasoning": "brief explanation"
}"""


class AnalysisAgent:
    """Agent 2 — uses an LLM to identify fraud patterns from retrieved transactions."""

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        self.model = os.getenv("OLLAMA_LLM_MODEL", "llama3.2")

    def _format_similar(self, similar: list) -> str:
        lines = []
        for i, tx in enumerate(similar, 1):
            label = "FRAUD" if tx.get("is_fraud") else "LEGITIMATE"
            fraud_type = f" ({tx['fraud_type']})" if tx.get("fraud_type") else ""
            score = tx.get("similarityScore", 0)
            lines.append(
                f"{i}. [{label}{fraud_type}] {tx.get('description', '')} "
                f"| ${tx.get('amount', 0):.2f} | {tx.get('merchant', '')} "
                f"| {tx.get('location', '')} | similarity: {score:.4f}"
            )
        return "\n".join(lines)

    def run(self, transaction: dict, similar: list) -> dict:
        user_prompt = (
            f"NEW TRANSACTION TO ANALYZE:\n"
            f"Description: {transaction['description']}\n"
            f"Amount: ${transaction['amount']:.2f}\n"
            f"Merchant: {transaction['merchant']}\n"
            f"Category: {transaction['category']}\n"
            f"Location: {transaction['location']}\n\n"
            f"SIMILAR HISTORICAL TRANSACTIONS:\n"
            f"{self._format_similar(similar)}\n\n"
            f"Analyze the new transaction and respond with JSON only."
        )

        response = requests.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
                "format": "json",
            },
            timeout=120,
        )
        response.raise_for_status()
        content = response.json()["message"]["content"]

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            risk_level = "MEDIUM"
            if "HIGH" in content.upper():
                risk_level = "HIGH"
            elif "LOW" in content.upper():
                risk_level = "LOW"
            return {
                "risk_indicators": [],
                "trust_signals": [],
                "risk_level": risk_level,
                "reasoning": content[:500],
            }
