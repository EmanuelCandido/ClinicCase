package com.SistemaApiCrud.SistemaCrud.service;

import com.SistemaApiCrud.SistemaCrud.dto.PerguntasGeradasIaDTO;

public interface PerguntaAiClient {

    PerguntasGeradasIaDTO gerarPerguntas(String instrucoesSistema, String contexto);

    default RespostaIaComMetricas<PerguntasGeradasIaDTO> gerarPerguntasComMetricas(
            String instrucoesSistema,
            String contexto) {
        return RespostaIaComMetricas.semMetricas(gerarPerguntas(instrucoesSistema, contexto));
    }

    /**
     * Variante que conhece a quantidade pedida, para limitar o tamanho da resposta da IA.
     */
    default RespostaIaComMetricas<PerguntasGeradasIaDTO> gerarPerguntasComMetricas(
            String instrucoesSistema,
            String contexto,
            int quantidadePerguntas) {
        return gerarPerguntasComMetricas(instrucoesSistema, contexto);
    }
}
