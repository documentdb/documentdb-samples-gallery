import os

from dotenv import load_dotenv

load_dotenv()

from agents.analysis_agent import AnalysisAgent
from agents.decision_agent import DecisionAgent
from agents.retrieval_agent import RetrievalAgent
from utils.db import get_client, get_collection

# Transactions to analyze — different from the training data
SAMPLE_TRANSACTIONS = [
    {
        "description": "Online purchase of high-value gift cards at multiple retailers within minutes of each other",
        "amount": 2400.00,
        "merchant": "RetailMart Gift Cards",
        "category": "Gift Cards",
        "location": "Online",
    },
    {
        "description": "Restaurant dinner charge at a local bistro, regular weekend dining spot for this customer",
        "amount": 87.50,
        "merchant": "The Rustic Bistro",
        "category": "Dining",
        "location": "New York, NY",
    },
    {
        "description": "International wire to overseas account initiated immediately after account password was changed",
        "amount": 9800.00,
        "merchant": "International Wire Service",
        "category": "Transfer",
        "location": "International",
    },
    {
        "description": "Monthly grocery shopping at familiar supermarket consistent with prior month patterns",
        "amount": 143.22,
        "merchant": "Fresh Grocers",
        "category": "Groceries",
        "location": "Brooklyn, NY",
    },
    {
        "description": "Luxury watch purchase from unknown online vendor, shipping address completely different from billing",
        "amount": 3750.00,
        "merchant": "Prestige Timepieces",
        "category": "Luxury Goods",
        "location": "Online",
    },
]

GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

DECISION_COLOR = {"APPROVE": GREEN, "REVIEW": YELLOW, "BLOCK": RED}


def separator():
    print("=" * 70)


def main():
    client = get_client()
    col = get_collection(client)

    retrieval = RetrievalAgent(col)
    analysis  = AnalysisAgent()
    decision  = DecisionAgent()

    print(f"\n{BOLD}Fraud Detection Multi-Agent System{RESET}")
    print(f"Database : {os.getenv('DOCUMENTDB_DATABASE', 'frauddb')}")
    print(f"LLM Model: {os.getenv('OLLAMA_LLM_MODEL', 'llama3.2')}")
    print(f"Neighbors: {os.getenv('NEAREST_NEIGHBORS', '5')}")

    for i, tx in enumerate(SAMPLE_TRANSACTIONS, 1):
        separator()
        print(f"\nTransaction {i}/{len(SAMPLE_TRANSACTIONS)}")
        print(f"  Merchant : {tx['merchant']}")
        print(f"  Amount   : ${tx['amount']:.2f}")
        print(f"  Location : {tx['location']}")
        print(f"  Details  : {tx['description']}\n")

        print("[ Agent 1: Retrieval ] Finding similar historical transactions...")
        similar = retrieval.run(tx)
        fraud_count = sum(1 for s in similar if s.get("is_fraud"))
        legit_count = len(similar) - fraud_count
        print(f"  Found {len(similar)} similar transactions ({fraud_count} fraud, {legit_count} legitimate)\n")

        print("[ Agent 2: Analysis  ] Identifying risk patterns...")
        result = analysis.run(tx, similar)
        risk_level = result.get("risk_level", "UNKNOWN")
        risk_color = {"LOW": GREEN, "MEDIUM": YELLOW, "HIGH": RED}.get(risk_level, "")
        print(f"  Risk Level : {risk_color}{risk_level}{RESET}")
        indicators = result.get("risk_indicators", [])
        if indicators:
            print(f"  Indicators : {', '.join(indicators[:3])}")
        signals = result.get("trust_signals", [])
        if signals:
            print(f"  Trust      : {', '.join(signals[:2])}")
        print()

        print("[ Agent 3: Decision  ] Making final verdict...")
        verdict = decision.run(tx, result)
        dec = verdict.get("decision", "REVIEW")
        color = DECISION_COLOR.get(dec, "")
        confidence = verdict.get("confidence", 0)

        print(f"\n  {BOLD}VERDICT : {color}{dec}{RESET}{BOLD} (confidence: {confidence:.0%}){RESET}")
        print(f"  Reason  : {verdict.get('reason', '')}")
        print(f"  Action  : {verdict.get('recommended_action', '')}")

    separator()
    client.close()


if __name__ == "__main__":
    main()
