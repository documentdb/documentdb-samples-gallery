from dotenv import load_dotenv

load_dotenv()

from utils.db import get_client, get_collection


def main():
    client = get_client()
    col = get_collection(client)
    col.drop()
    print(f"Dropped collection: {col.full_name}")
    client.close()


if __name__ == "__main__":
    main()
