import sys
sys.path.insert(0, ".")
from auth_helper import api_get, api_post

existing = api_get("publishers?$filter=customizationprefix eq 'geek'&$select=publisherid")
if existing.get("value"):
    print("Publisher 'geek' already exists:", existing["value"][0]["publisherid"])
else:
    new_id = api_post("publishers", {
        "uniquename": "geekfactorydx",
        "friendlyname": "Geek Factory DX Publisher",
        "customizationprefix": "geek",
        "customizationoptionvalueprefix": 10000,
    })
    print("Created publisher 'geek':", new_id)
