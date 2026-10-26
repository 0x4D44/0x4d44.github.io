"""Rebuild all models: <venv>/bin/python tools/assets_build.py"""
import subprocess, sys, os
here = os.path.dirname(os.path.abspath(__file__))
for s in ('assets_train.py', 'assets_tunnel.py', 'assets_kit.py', 'assets_misc.py', 'assets_station.py'):
    subprocess.check_call([sys.executable, os.path.join(here, s)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print('ok')
