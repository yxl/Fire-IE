@echo off
if defined VS100COMNTOOLS (
call "%VS100COMNTOOLS%\vsvars32.bat")
buildwin 100 build static_mt debug Win32 nosamples
