# filename: refund_slack.py
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

def request_refund(charge_id, amount, reason):
    """
    Requests a refund using the Enterprise Payments API.
    :param charge_id: The identifier of the charge to refund.
    :param amount: A positive integer in cents representing how much of this charge to refund.
    :param reason:  The reason for the refund ("duplicate", "fraudulent", or "requested_by_customer").
    :return: True if successful, False otherwise.
    """
    url = "https://api.stripe.com/v2/refunds"
    headers = {
        "Authorization": f"Bearer YOUR_STRIPE_SECRET_KEY",  # Replace with your actual Stripe secret key
        "Content-Type": "application/json"
    }
    payload = {
        "charge_id": charge_id,
        "amount": amount,
        "reason": reason
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        return response.status_code == 200 and response.json()["id"] is not None
    except Exception as e:
        print(f"Error requesting refund: {e}")
        return False

if __name__ == "__main__":
    recipient = input("Recipient phone number (E.164 format): ")
    sender = input("Your Twilio verified sender number: ")
    text = input("Message content: ")

    # Example usage of the refund function - REMOVE or COMMENT OUT in production
    charge_id = "ch_xxxxxxxxxxxxxxxx"  # Replace with a valid Charge ID
    amount = 1000  # 10.00 USD
    reason = "requested_by_customer"

    refund_success = request_refund(charge_id, amount, reason)

    if refund_success:
        print("Refund requested successfully!")
    else:
        print("Failed to request refund")