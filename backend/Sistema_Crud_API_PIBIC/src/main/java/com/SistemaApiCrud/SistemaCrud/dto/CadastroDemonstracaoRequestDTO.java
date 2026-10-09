package com.SistemaApiCrud.SistemaCrud.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Cadastro completo do professor. O e-mail passa a ser o usuario de acesso, por isso fica limitado
 * ao tamanho da coluna de username.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CadastroDemonstracaoRequestDTO {

    @NotBlank(message = "O nome e obrigatorio")
    @Size(max = 70, message = "O nome deve ter no maximo 70 caracteres")
    private String nome;

    @NotBlank(message = "O sobrenome e obrigatorio")
    @Size(max = 79, message = "O sobrenome deve ter no maximo 79 caracteres")
    private String sobrenome;

    @NotBlank(message = "E-mail obrigatorio")
    @Email(message = "E-mail invalido")
    @Size(max = 100, message = "O e-mail deve ter no maximo 100 caracteres")
    private String email;

    @NotBlank(message = "A senha e obrigatoria")
    @Size(min = 8, max = 72, message = "A senha deve ter entre 8 e 72 caracteres")
    @Pattern(regexp = "^(?=.*\\p{L})(?=.*\\d).+$", message = "A senha deve conter letras e numeros")
    private String senha;

    @NotBlank(message = "A area de atuacao e obrigatoria")
    @Size(max = 120, message = "A area de atuacao deve ter no maximo 120 caracteres")
    private String areaAtuacao;

    @NotBlank(message = "O cargo e obrigatorio")
    @Size(max = 60, message = "O cargo deve ter no maximo 60 caracteres")
    private String cargo;

    @AssertTrue(message = "E necessario aceitar os Termos de Uso e a Politica de Privacidade")
    private boolean aceiteTermos;
}
