package com.SistemaApiCrud.SistemaCrud.service;

import org.springframework.ai.chat.client.ResponseEntity;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.StructuredOutputValidationAdvisor;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.SistemaApiCrud.SistemaCrud.dto.PerguntasGeradasIaDTO;
import com.SistemaApiCrud.SistemaCrud.exception.AiProviderException;
import com.SistemaApiCrud.SistemaCrud.exception.CapacidadeIaEsgotadaException;
import com.SistemaApiCrud.SistemaCrud.exception.LimiteUsoIaException;
import com.SistemaApiCrud.SistemaCrud.exception.ServicoIndisponivelException;
import com.SistemaApiCrud.SistemaCrud.exception.TempoEsgotadoIaException;

@Service
public class SpringAiPerguntaClient implements PerguntaAiClient {

    // Modelos que raciocinam antes de responder (gpt-oss, por exemplo) gastam parte do teto no
    // raciocinio; um teto apertado corta o JSON no meio. O teto cresce com a quantidade pedida
    // e continua abaixo dos 8.000 tokens por minuto dos modelos gratuitos mais usados.
    private static final int TOKENS_BASE_RESPOSTA = 2000;
    private static final int TOKENS_POR_PERGUNTA = 400;

    private final ChatClient clienteConversa;
    private final ControleUsoIa controleUsoIa;
    private final PrioridadeModelosIa prioridadeModelos;

    public SpringAiPerguntaClient(
            ChatClient.Builder construtorClienteConversa,
            ControleUsoIa controleUsoIa) {
        this(construtorClienteConversa, controleUsoIa, PrioridadeModelosIa.padrao());
    }

    @Autowired
    public SpringAiPerguntaClient(
            ChatClient.Builder construtorClienteConversa,
            ControleUsoIa controleUsoIa,
            PrioridadeModelosIa prioridadeModelos) {
        this.clienteConversa = construtorClienteConversa
                .defaultAdvisors(StructuredOutputValidationAdvisor.builder()
                        .outputType(PerguntasGeradasIaDTO.class)
                        .maxRepeatAttempts(0)
                        .build())
                .build();
        this.controleUsoIa = controleUsoIa;
        this.prioridadeModelos = prioridadeModelos;
    }

    @Override
    public PerguntasGeradasIaDTO gerarPerguntas(String instrucoesSistema, String contexto) {
        return gerarPerguntasComMetricas(instrucoesSistema, contexto).entidade();
    }

    @Override
    public RespostaIaComMetricas<PerguntasGeradasIaDTO> gerarPerguntasComMetricas(
            String instrucoesSistema,
            String contexto) {
        return gerarPerguntasComMetricas(instrucoesSistema, contexto, 0);
    }

    /**
     * O gateway estima o consumo por minuto somando entrada e teto de saida; um teto proporcional
     * a quantidade de perguntas evita reservar 4.000 tokens para um pedido pequeno.
     */
    static Integer tetoTokensSaida(int quantidadePerguntas) {
        return quantidadePerguntas < 1
                ? null
                : TOKENS_BASE_RESPOSTA + quantidadePerguntas * TOKENS_POR_PERGUNTA;
    }

    @Override
    public RespostaIaComMetricas<PerguntasGeradasIaDTO> gerarPerguntasComMetricas(
            String instrucoesSistema,
            String contexto,
            int quantidadePerguntas) {
        Integer tetoTokens = tetoTokensSaida(quantidadePerguntas);
        try {
            long inicio = System.nanoTime();
            ResponseEntity<ChatResponse, PerguntasGeradasIaDTO> resposta = controleUsoIa.executar(
                    () -> PrioridadeModelosIa.executar(
                            prioridadeModelos.modelosPerguntas(),
                            modelo -> comOpcoes(clienteConversa.prompt(), modelo, tetoTokens)
                                    .system(instrucoesSistema)
                                    .user(contexto)
                                    .call()
                                    .responseEntity(PerguntasGeradasIaDTO.class)));
            long duracaoMs = (System.nanoTime() - inicio) / 1_000_000L;
            PerguntasGeradasIaDTO perguntas = resposta == null ? null : resposta.entity();

            if (perguntas == null) {
                throw new AiProviderException("A IA retornou perguntas em formato invalido");
            }
            return comMetricas(perguntas, resposta == null ? null : resposta.response(), duracaoMs);
        } catch (AiProviderException
                | CapacidadeIaEsgotadaException
                | LimiteUsoIaException
                | TempoEsgotadoIaException falha) {
            throw falha;
        } catch (RuntimeException falha) {
            if (FalhasIa.possuiLimiteDoProvedor(falha)) {
                throw new CapacidadeIaEsgotadaException(
                        "Todos os provedores gratuitos de IA atingiram a capacidade disponivel",
                        60,
                        falha);
            }
            if (FalhasIa.possuiTempoEsgotado(falha)) {
                throw new TempoEsgotadoIaException(
                        "O provedor de IA excedeu o tempo limite da requisicao",
                        falha);
            }
            if (FalhasIa.possuiIndisponibilidadeDeRede(falha)) {
                throw new ServicoIndisponivelException(
                        "O gateway de IA esta indisponivel. Verifique se o servico configurado em IA_URL_BASE esta ativo",
                        falha);
            }
            throw new AiProviderException("Nao foi possivel gerar perguntas com o provedor de IA", falha);
        }
    }

    private static ChatClient.ChatClientRequestSpec comOpcoes(
            ChatClient.ChatClientRequestSpec requisicao, String modelo, Integer tetoTokens) {
        if (modelo == null && tetoTokens == null) {
            return requisicao;
        }
        ChatOptions.Builder opcoes = ChatOptions.builder();
        if (modelo != null) {
            opcoes.model(modelo);
        }
        if (tetoTokens != null) {
            opcoes.maxTokens(tetoTokens);
        }
        return requisicao.options(opcoes);
    }

    private RespostaIaComMetricas<PerguntasGeradasIaDTO> comMetricas(
            PerguntasGeradasIaDTO perguntas,
            ChatResponse resposta,
            long duracaoMs) {
        ChatResponseMetadata metadados = resposta == null ? null : resposta.getMetadata();
        Usage uso = metadados == null ? null : metadados.getUsage();
        return new RespostaIaComMetricas<>(
                perguntas,
                duracaoMs,
                metadados == null ? null : metadados.getModel(),
                uso == null ? null : uso.getPromptTokens(),
                uso == null ? null : uso.getCompletionTokens());
    }
}
