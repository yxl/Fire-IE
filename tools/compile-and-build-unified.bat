@rem Add path to MSBuild Binaries
@if exist "%ProgramFiles%\MSBuild\14.0\bin" set PATH=%ProgramFiles%\MSBuild\14.0\bin;%PATH%
@if exist "%ProgramFiles(x86)%\MSBuild\14.0\bin" set PATH=%ProgramFiles(x86)%\MSBuild\14.0\bin;%PATH%

@rem Call msbuild
@cd ..
@MSBuild fireie.msbuild /t:unified
@if errorlevel 1 (
  @echo Build failed. See the above output for details.
  @pause
)
