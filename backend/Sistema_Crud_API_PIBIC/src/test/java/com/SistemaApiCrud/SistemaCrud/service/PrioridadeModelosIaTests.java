package com.SistemaApiCrud.SistemaCrud.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.ConnectException;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class PrioridadeModelosIaTests {

    @Test
    void converteListaRemovendoEspacosVaziosEDuplicados() {
        var prioridade = new PrioridadeModelosIa(" claude-opus-5 , ,claude-sonnet-4-6,claude-opus-5,auto", "");

        assertThat(prioridade.modelosCaso()).containsExactly("claude-opus-5", "claude-sonnet-4-6", "auto");
        assertThat(prioridade.modelosPerguntas()).isEmpty();
    }

    @Test
    void listaVaziaUsaModeloPadrao() {
        List<String> usados = new ArrayList<>();

        String resultado = PrioridadeModelosIa.executar(List.of(), modelo -> {
            usados.add(String.valueOf(modelo));
            return "ok";
        });

        assertThat(resultado).isEqualTo("ok");
        assertThat(usados).containsExactly("null");
    }

    @Test
    void passaAoProximoModeloQuandoProvedorRecusa() {
        List<String> usados = new ArrayList<>();

        String resultado = PrioridadeModelosIa.executar(List.of("claude-opus-5", "claude-sonnet-4-6"), modelo -> {
            usados.add(modelo);
            if ("claude-opus-5".equals(modelo)) {
                throw new RuntimeException(new RateLimitException());
            }
            return modelo;
        });

        assertThat(resultado).isEqualTo("claude-sonnet-4-6");
        assertThat(usados).containsExactly("claude-opus-5", "claude-sonnet-4-6");
    }

    @Test
    void naoTrocaModeloQuandoGatewayEstaFora() {
        List<String> usados = new ArrayList<>();

        assertThatThrownBy(() -> PrioridadeModelosIa.executar(List.of("claude-opus-5", "auto"), modelo -> {
            usados.add(modelo);
            throw new RuntimeException(new ConnectException("Connection refused"));
        })).hasRootCauseInstanceOf(ConnectException.class);

        assertThat(usados).containsExactly("claude-opus-5");
    }

    @Test
    void propagaFalhaDoUltimoModelo() {
        assertThatThrownBy(() -> PrioridadeModelosIa.executar(List.of("a", "b"), modelo -> {
            throw new IllegalStateException("falha " + modelo, new NotFoundException());
        })).hasMessage("falha b");
    }

    /** Simula com.openai.errors.RateLimitException, identificada pelo nome simples. */
    private static final class RateLimitException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }

    /** Simula com.openai.errors.NotFoundException, identificada pelo nome simples. */
    private static final class NotFoundException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
