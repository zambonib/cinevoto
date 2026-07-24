#!/bin/bash
# Script para rodar o CineVoto no Ubuntu / Linux

echo "=========================================="
echo "Compilando CineVoto (Java + Web)"
echo "=========================================="
mkdir -p bin
javac -cp "lib/*" -d bin src/VotacaoFilmeServer.java

if [ $? -ne 0 ]; then
    echo ""
    echo "[ERRO] Falha ao compilar o código Java."
    exit 1
fi

echo ""
echo "=========================================="
echo "Iniciando Servidor na porta 8080..."
echo "=========================================="
# Permite rodar com porta customizada passando argumento, ex: ./run.sh 9090
java -cp "bin:lib/*" src.VotacaoFilmeServer "$@"
