"""
TrackerMode v2.4 — PyInstaller Build Script
Mengonversi Project menjadi Single Executable (.exe) untuk Windows.
"""

import subprocess
import sys
import os
import shutil

def build():
    # 1. Bersihkan folder build lama agar tidak konflik
    folders_to_clean = ['build', 'dist']
    for folder in folders_to_clean:
        if os.path.exists(folder):
            print(f"[*] Menghapus folder {folder} lama...")
            shutil.rmtree(folder)

    # 2. Konfigurasi Command PyInstaller
    # --collect-submodules & --hidden-import memastikan MediaPipe & OpenCV ikut terbungkus
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onedir",
        "--add-data", "static;static",
        "--add-data", "face_landmarker.task;.",
        "--collect-all", "mediapipe",
        "--collect-all", "tensorflow",
        "--collect-data", "cv2",
        "--hidden-import", "pygetwindow",
        "--hidden-import", "pynput.keyboard._win32",
        "--hidden-import", "pynput.mouse._win32",
        "--name", "TrackerMode", #nama
        "--icon", "static/favicon.ico",
        "server.py", # file utama
    ]

    print("=" * 50)
    print("🚀 TrackerMode — Memulai Proses Build Desktop App")
    print(f"📂 Lokasi Project: {os.getcwd()}")
    print("=" * 50)

    # 3. Jalankan Proses Build
    try:
        result = subprocess.run(cmd, check=True)
        if result.returncode == 0:
            print("\n" + "=" * 50)
            print("✅ BUILD BERHASIL!")
            print("📁 File kamu ada di: dist/TrackerMode.exe")
            print("=" * 50)
            print("\nTips: Jika aplikasi langsung close saat diklik, jalankan lewat")
            print("Terminal/CMD untuk melihat pesan errornya.")
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Build gagal dengan error code {e.returncode}")
        sys.exit(e.returncode)
    except Exception as e:
        print(f"\n❌ Terjadi kesalahan sistem: {e}")
        sys.exit(1)

if __name__ == "__main__":
    build()
