package com.SistemaApiCrud.SistemaCrud.exception;

public class MuitasTentativasLoginException extends RuntimeException {

    private final long retryAfterSeconds;

    public MuitasTentativasLoginException(long retryAfterSeconds) {
        this("Muitas tentativas de login. Tente novamente mais tarde", retryAfterSeconds);
    }

    public MuitasTentativasLoginException(String mensagem, long retryAfterSeconds) {
        super(mensagem);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
