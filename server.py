from flask import Flask, request, jsonify
from flask_cors import CORS
from pprint import pprint
app = Flask(__name__)
CORS(app)

@app.route('/', methods=['GET','POST'])
def hello_world():
    assert request.method == 'POST'
    data = request.json
    arr = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    return jsonify(
        data=arr
    )