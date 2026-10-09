package com.SistemaApiCrud.SistemaCrud.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Ordem de preferencia dos modelos por operacao. Cada chamada tenta o primeiro modelo e passa
 * ao seguinte somente quando o provedor recusa o modelo (inexistente, sem cota ou com erro HTTP).
 * Lista vazia mantem o modelo padrao de spring.ai.openai.chat.model.
 */
@Component
public class PrioridadeModelosIa {

    private static final Logger LOG = LoggerFactory.getLogger(PrioridadeModelosIa.class);

    private static final Set<String> FALHAS_QUE_TROCAM_MODELO = Set.of(
            "RateLimitException",
            "NotFoundException",
            "BadRequestException",
            "UnprocessableEntityException",
            "PermissionDeniedException",
            "InternalServerException",
            "UnexpectedStatusCodeException");

    private final List<String> modelosCaso;
    private final List<String> modelosPerguntas;

    public PrioridadeModelosIa(
            @Value("${app.ia.modelos.caso:}") String modelosCaso,
            @Value("${app.ia.modelos.perguntas:}") String modelosPerguntas) {
        this.modelosCaso = converter(modelosCaso);
        this.modelosPerguntas = converter(modelosPerguntas);
    }

    public static PrioridadeModelosIa padrao() {
        return new PrioridadeModelosIa("", "");
    }

    public List<String> modelosCaso() {
        return modelosCaso;
    }

    public List<String> modelosPerguntas() {
        return modelosPerguntas;
    }

    public String descreverCaso() {
        return modelosCaso.isEmpty() ? "" : String.join(">", modelosCaso);
    }

    /**
     * Executa a chamada com cada modelo da lista, em ordem. Um valor nulo representa o modelo padrao.
     */
    public static <T> T executar(List<String> modelos, Function<String, T> chamada) {
        if (modelos.isEmpty()) {
            return chamada.apply(null);
        }
        RuntimeException ultimaFalha = null;
        for (int indice = 0; indice < modelos.size(); indice++) {
            String modelo = modelos.get(indice);
            try {
                return chamada.apply(modelo);
            } catch (RuntimeException falha) {
                boolean haProximo = indice < modelos.size() - 1;
                if (!haProximo || !deveTrocarModelo(falha)) {
                    throw falha;
                }
                LOG.warn("ia_modelo_fallback modelo={} proximo={} falha={}",
                        modelo, modelos.get(indice + 1), nomeFalhaProvedor(falha));
                ultimaFalha = falha;
            }
        }
        throw ultimaFalha;
    }

    static boolean deveTrocarModelo(Throwable falha) {
        return nomeFalhaProvedor(falha) != null;
    }

    private static String nomeFalhaProvedor(Throwable falha) {
        Throwable causaAtual = falha;
        while (causaAtual != null) {
            String nome = causaAtual.getClass().getSimpleName();
            if (FALHAS_QUE_TROCAM_MODELO.contains(nome)) {
                return nome;
            }
            causaAtual = causaAtual.getCause();
        }
        return null;
    }

    private static List<String> converter(String valor) {
        if (valor == null || valor.isBlank()) {
            return List.of();
        }
        List<String> modelos = new ArrayList<>();
        Arrays.stream(valor.split(","))
                .map(String::trim)
                .filter(modelo -> !modelo.isEmpty())
                .filter(modelo -> !modelos.contains(modelo))
                .forEach(modelos::add);
        return Collections.unmodifiableList(modelos);
    }
}
