from flask import Flask, request, jsonify
from flask_cors import CORS
from pprint import pprint
app = Flask(__name__)
CORS(app)

@app.route('/', methods=['GET','POST'])
def hello_world():
    assert request.method == 'POST'
    data = request.json
    return jsonify(
        moves=[.1,.1,.1,.1],
        zmoves=[.1,.1,.1,.1],
        switch=[.1,.1,.1,.1,.1,.1],
        mega=.5,
    )