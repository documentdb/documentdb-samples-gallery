import json
import os

import requests

DECISION_SYSTEM_PROMPT = """You are the final decision-maker in a fraud detection pipeline.

Given a transaction and its risk analysis, output a final decision:
- APPROVE: Low risk, process the transaction normally
- REVIEW: Medium risk, flag for human review before processing
- BLOCK: High risk, block the transaction immediately

Respond ONLY with valid JSON in this exact format:
{
  "decision": "APPROVE",
  "confidence": 0.85,
  "reason": "one sentence explanation",
  "recommended_action": "specific next step for the operations team"
}"""


class DecisionAgent:
    """Agent 3 — makes the final APPROVE / REVIEW / BLOCK verdict."""

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        self.model = os.getenv("OLLAMA_LLM_MODEL", "llama3.2")

    def run(self, transaction: dict, analysis: dict) -> dict:
        risk_indicators = ", ".join(analysis.get("risk_indicators", [])) or "none"
        trust_signals = ", ".join(analysis.get("trust_signals", [])) or "none"

        user_prompt = (
            f"TRANSACTION:\n"
            f"  {transaction['description']}\n"
            f"  Amount: ${transaction['amount']:.2f} | Merchant: {transaction['merchant']} | Location: {transaction['location']}\n\n"
            f"RISK ANALYSIS:\n"
            f"  Risk Level  : {analysis.get('risk_level', 'UNKNOWN')}\n"
            f"  Risk Indicators: {risk_indicators}\n"
            f"  Trust Signals  : {trust_signals}\n"
            f"  Reasoning   : {analysis.get('reasoning', '')}\n\n"
            f"Make a final decision. Respond with JSON only."
        )

        response = requests.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": DECISION_SYSTEM_PROMPT},
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
            risk_level = analysis.get("risk_level", "MEDIUM")
            decision_map = {"LOW": "APPROVE", "MEDIUM": "REVIEW", "HIGH": "BLOCK"}
            return {
                "decision": decision_map.get(risk_level, "REVIEW"),
                "confidence": 0.5,
                "reason": "Automatic fallback decision based on risk level.",
                "recommended_action": "Manual review required.",
            }
