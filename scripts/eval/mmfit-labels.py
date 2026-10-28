"""Read MM-Fit's per-workout label CSVs straight out of the 1.7 GB zip using
HTTP range requests, without downloading the sensor data.

Writes test-videos/datasets/mmfit/labels/<workout>_labels.csv.
MM-Fit: https://mmfit.github.io/ (CC BY 4.0). Cite: Strömbäck, Huang, Radu,
"MM-Fit: Multimodal Deep Learning for Automatic Exercise Logging Across
Sensing Devices", IMWUT 4(4), 2020.
"""
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

URL = 'https://s3.eu-west-2.amazonaws.com/vradu.uk/mm-fit.zip'
OUT = Path(__file__).resolve().parents[2] / 'test-videos/datasets/mmfit/labels'


class HttpRangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP range requests."""

    def __init__(self, url):
        self.url = url
        req = urllib.request.Request(url, method='HEAD')
        self.size = int(urllib.request.urlopen(req).headers['Content-Length'])
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def readinto(self, b):
        if self.pos >= self.size:
            return 0
        end = min(self.size, self.pos + len(b)) - 1
        req = urllib.request.Request(self.url, headers={'Range': f'bytes={self.pos}-{end}'})
        data = urllib.request.urlopen(req).read()
        b[: len(data)] = data
        self.pos += len(data)
        return len(data)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(io.BufferedReader(HttpRangeFile(URL), buffer_size=1 << 16))
    names = z.namelist()
    if '--list' in sys.argv:
        for n in names[:80]:
            print(n)
        print(len(names), 'entries')
        return
    labels = [n for n in names if n.endswith('_labels.csv')]
    for n in labels:
        (OUT / Path(n).name).write_bytes(z.read(n))
    print(f'{len(labels)} label files in {OUT}')


main()
