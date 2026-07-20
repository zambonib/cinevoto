@echo off
echo ==========================================
echo Compilando CineVoto (Java + Web)
echo ==========================================
if not exist bin mkdir bin
javac -d bin src\VotacaoFilmeServer.java
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao compilar o código Java. Verifique se o JDK está instalado e no seu PATH.
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo Iniciando Servidor...
echo ==========================================
java -cp bin src.VotacaoFilmeServer
pause
