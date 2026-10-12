---
<<< SEARCH
#!/usr/bin/env python3

# filename: send_twilio_sms.py
"""
Automatically sends an SMS message using Twilio API
"""

import requests
import os
import base64

def send_sms(to_number, from_number, message):
    """
    Sends an SMS message through Twilio
    :param to_number: Recipient phone number in E.164 format
    :param from_number: Your Twilio verified sender number
    :param message: Text of the message
    :return: True if successful, False otherwise
    """
    # Get credentials from environment variables or defaults
    twilio_account_sid = os.environ.get("TWILIO_ACCOUNT_SID") or "YOUR_TWILIO_ACCOUNT_SID"
    twilio_auth_token = os.environ.get("TWILIO_AUTH_TOKEN") or "YOUR_TWILIO_AUTH_TOKEN"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_account_sid}/Messages.json"
    
    headers = {
        "Authorization": f"Basic {base64.b64encode(f'{twilio_account_sid}:{twilio_auth_token}'.encode()).decode()}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    payload = {
        "To": to_number,
        "From": from_number,
        "Body": message
    }

    try:
        response = requests.post(url, headers=headers, data=payload)
        return response.status_code == 201 and response.text.strip() != 'null'
    except Exception as e:
        print(f"Error sending SMS: {e}")
        return False

if __name__ == "__main__":
    recipient = input("Recipient phone number (E.164 format): ")
    sender = input("Your Twilio verified sender number: ")
    text = input("Message content: ")

    success = send_sms(recipient, sender, text)
    if success:
        print("SMS sent successfully!")
    else:
        print("Failed to send SMS")
>>>>>>> REPLACE
---
### filename: refund_slack.py
# filename: send_twilio_sms.py
"""
Automatically sends an SMS message using Twilio API
"""

import requests
import os
import base64

def send_sms(to_number, from_number, message):
    """
    Sends an SMS message through Twilio
    :param to_number: Recipient phone number in E.164 format
    :param from_number: Your Twilio verified sender number
    :param message: Text of the message
    :return: True if successful, False otherwise
    """
    # Get credentials from environment variables or defaults
    twilio_account_sid = os.environ.get("TWILIO_ACCOUNT_SID") or "YOUR_TWILIO_ACCOUNT_SID"
    twilio_auth_token = os.environ.get("TWILIO_AUTH_TOKEN") or "YOUR_TWILIO_AUTH_TOKEN"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_account_sid}/Messages.json"
    
    headers = {
        "Authorization": f"Basic {base64.b64encode(f'{twilio_account_sid}:{twilio_auth_token}'.encode()).decode()}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    payload = {
        "To": to_number,
        "From": from_number,
        "Body": message
    }

    try:
        response = requests.post(url, headers=headers, data=payload)
        return response.status_code == 201 and response.text.strip() != 'null'
    except Exception as e:
        print(f"Error sending SMS: {e}")
        return False

if __name__ == "__main__":
    recipient = input("Recipient phone number (E.164 format): ")
    sender = input("Your Twilio verified sender number: ")
    text = input("Message content: ")

    success = send_sms(recipient, sender, text)
    if success:
        print("SMS sent successfully!")
    else:
        print("Failed to send SMS")