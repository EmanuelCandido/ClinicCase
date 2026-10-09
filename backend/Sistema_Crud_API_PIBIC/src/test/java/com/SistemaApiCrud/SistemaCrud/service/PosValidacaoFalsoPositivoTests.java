package com.SistemaApiCrud.SistemaCrud.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.SistemaApiCrud.SistemaCrud.dto.CasoClinicoGeradoIaDTO;

class PosValidacaoFalsoPositivoTests {

    @Test
    void reconheceRecusaQueSoApontaParametrosNaoPresentes() {
        Map<String, String> violacoes = new LinkedHashMap<>();
        violacoes.put("disciplina", "não presente");
        violacoes.put("titulo", "não presente");
        violacoes.put("estilo", "Não está presente no conteúdo");
        violacoes.put("especialidade", "ausente no texto");
        violacoes.put("nivelDificuldade", "not present");
        violacoes.put("areaSaude", "não mencionada");

        assertThat(ServicoCasoClinicoIa.apenasParametrosAusentes(validacao("INCOERENTE", violacoes))).isTrue();
    }

    @Test
    void naoIgnoraProblemaNoConteudoClinico() {
        assertThat(ServicoCasoClinicoIa.apenasParametrosAusentes(validacao("INCOERENTE", Map.of(
                "titulo", "não presente",
                "diagEsperado", "não presente")))).isFalse();
        assertThat(ServicoCasoClinicoIa.apenasParametrosAusentes(validacao("INCOERENTE", Map.of(
                "especialidade", "O caso descreve pneumonia, não cardiologia")))).isFalse();
        assertThat(ServicoCasoClinicoIa.apenasParametrosAusentes(validacao("COERENTE", Map.of()))).isFalse();
        assertThat(ServicoCasoClinicoIa.apenasParametrosAusentes(validacao("INCOERENTE", Map.of()))).isFalse();
    }

    private CasoClinicoGeradoIaDTO validacao(String status, Map<String, String> violacoes) {
        CasoClinicoGeradoIaDTO dto = new CasoClinicoGeradoIaDTO();
        dto.setStatusCoerencia(status);
        dto.setViolacoes(violacoes);
        return dto;
    }
}
