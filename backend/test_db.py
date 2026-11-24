
from database import test_connection

try:
    database_name = test_connection()

    print("Database connection successful!")
    print("Connected database:", database_name)

except Exception as error:
    print("Connection failed:", error)
