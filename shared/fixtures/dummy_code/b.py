# Uh oh, B is importing A! Circular dependency!
from shared.fixtures.dummy_code.a import a_function

def some_function():
    print("I am B")
