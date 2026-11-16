"""Run every tests/e2e/test_*.py against a fresh mock backend.

Each test file gets its own mock server (clean in-memory spreadsheet) on a free port.
A line like `# env: OLD_CONTACTS=1` near the top of a test file is passed to the server.
Exit code is non-zero if any test fails.
"""
import glob
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def server_env(test_file):
    env = {}
    with open(test_file, encoding="utf-8") as f:
        for line in f.readlines()[:10]:
            if line.startswith("# env:"):
                for kv in line[len("# env:"):].split():
                    k, _, v = kv.partition("=")
                    env[k] = v
    return env


def main():
    only = sys.argv[1:]
    files = sorted(glob.glob(os.path.join(HERE, "e2e", "test_*.py")))
    if only:
        files = [f for f in files if any(o in os.path.basename(f) for o in only)]
    failed = []
    for f in files:
        name = os.path.basename(f)
        port = free_port()
        env = dict(os.environ, PORT=str(port), **server_env(f))
        srv = subprocess.Popen(["node", os.path.join(HERE, "mock_server.js")], env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        try:
            line = srv.stdout.readline()
            if "up" not in line:
                time.sleep(0.5)
                print(f"FAIL {name}: mock server did not start: {line}{srv.stdout.read() if srv.poll() is not None else ''}")
                failed.append(name)
                continue
            t0 = time.time()
            r = subprocess.run([sys.executable, f], env=dict(os.environ, E2E_BASE=f"http://localhost:{port}",
                               PYTHONPATH=os.path.join(HERE, "e2e")), capture_output=True, text=True, timeout=600)
            took = time.time() - t0
            if r.returncode == 0:
                print(f"ok   {name} ({took:.1f}s)")
            else:
                failed.append(name)
                print(f"FAIL {name} ({took:.1f}s)\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}")
        finally:
            srv.terminate()
            try:
                srv.wait(5)
            except subprocess.TimeoutExpired:
                srv.kill()
    print(f"\n{len(files) - len(failed)}/{len(files)} test files passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
