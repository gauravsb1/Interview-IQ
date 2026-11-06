"""Start one threaded worker; in-process model cache and session locks are shared."""
import os
from gunicorn.app.base import BaseApplication
from app import app


class Server(BaseApplication):
    def load_config(self):
        for key, value in {
            "bind": "0.0.0.0:" + os.environ["PORT"],
            "workers": 1, "threads": 8, "timeout": 300,
            "accesslog": "-", "errorlog": "-",
        }.items():
            self.cfg.set(key, value)

    def load(self):
        return app


if __name__ == "__main__":
    Server().run()
