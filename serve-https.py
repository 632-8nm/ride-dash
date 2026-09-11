"""自签名 HTTPS 静态服务:https://<本机IP>:8443/"""
import functools
import http.server
import ssl
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

httpd = http.server.ThreadingHTTPServer(
    ("0.0.0.0", 8443),
    functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT),
)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(os.path.join(ROOT, "cert.pem"), os.path.join(ROOT, "key.pem"))
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print("serving https on 0.0.0.0:8443, root:", ROOT)
httpd.serve_forever()
