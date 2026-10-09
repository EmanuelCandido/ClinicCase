package com.SistemaApiCrud.SistemaCrud.dto;

import java.util.List;

import com.SistemaApiCrud.SistemaCrud.entity.enums.NivelDificuldade;
import com.SistemaApiCrud.SistemaCrud.entity.enums.TipoPergunta;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.AssertTrue;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class GerarPerguntasIaRequestDTO {

    @Min(value = 1, message = "A quantidade minima de perguntas e 1")
    @Max(value = 2, message = "Gere no maximo 2 perguntas por vez")
    private Integer quantidade = 5;

    private TipoPergunta tipo = TipoPergunta.MULTIPLA_ESCOLHA;

    @Min(value = 2, message = "A quantidade minima de alternativas e 2")
    @Max(value = 5, message = "A quantidade maxima de alternativas e 5")
    private Integer quantidadeAlternativas = 4;

    @Size(
            min = 2,
            max = 5,
            message = "A distribuicao variada deve conter entre 2 e 5 tipos")
    private List<@Valid DistribuicaoPerguntaIaDTO> distribuicao;

    @Size(max = 2000, message = "As instrucoes adicionais devem ter no maximo 2000 caracteres")
    private String instrucoesAdicionais;

    /** Dificuldade das perguntas; quando ausente, segue o nivel cadastrado no caso. */
    private NivelDificuldade nivelDificuldade;

    @AssertTrue(message = "Confirme que os dados sao sinteticos ou foram desidentificados")
    @NotNull(message = "A confirmacao sobre os dados enviados a IA e obrigatoria")
    private Boolean dadosSinteticosOuDesidentificados;

    public GerarPerguntasIaRequestDTO(
            Integer quantidade,
            TipoPergunta tipo,
            Integer quantidadeAlternativas,
            String instrucoesAdicionais,
            Boolean dadosSinteticosOuDesidentificados) {
        this.quantidade = quantidade;
        this.tipo = tipo;
        this.quantidadeAlternativas = quantidadeAlternativas;
        this.instrucoesAdicionais = instrucoesAdicionais;
        this.dadosSinteticosOuDesidentificados = dadosSinteticosOuDesidentificados;
    }
}
