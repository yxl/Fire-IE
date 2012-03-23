set XPI_NAME=fireie64.xpi
cd ..
del /f/q %XPI_NAME%
cd extension
..\tools\7za a ..\%XPI_NAME% chrome\
..\tools\7za a ..\%XPI_NAME% defaults\
..\tools\7za a ..\%XPI_NAME% components\
..\tools\7za a ..\%XPI_NAME% modules\
..\tools\7za a ..\%XPI_NAME% plugins\*64.dll
..\tools\7za a ..\%XPI_NAME% chrome.manifest
..\tools\7za a ..\%XPI_NAME% install.rdf