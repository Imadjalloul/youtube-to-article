from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json

from youtube_transcript_api import YouTubeTranscriptApi


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            video_id = query.get("v", [""])[0]

            if not video_id:
                self._error(400, "Missing ?v= parameter")
                return

            ytt_api = YouTubeTranscriptApi()
            transcript = ytt_api.fetch(video_id)

            segments = [
                {"text": seg.text, "start": seg.start, "duration": seg.duration}
                for seg in transcript
            ]

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(json.dumps({"segments": segments}).encode())

        except Exception as e:
            self._error(500, str(e))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _error(self, code, msg):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps({"error": msg}).encode())
