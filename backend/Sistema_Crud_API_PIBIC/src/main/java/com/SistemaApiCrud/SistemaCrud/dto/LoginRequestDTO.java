package com.SistemaApiCrud.SistemaCrud.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class LoginRequestDTO {

    @NotBlank(message = "O usuario e obrigatorio")
    @Size(max = 100, message = "O usuario deve ter no maximo 100 caracteres")
    private String username;

    @NotBlank(message = "A senha e obrigatoria")
    @Size(max = 72, message = "A senha deve ter no maximo 72 caracteres")
    private String password;

    /** "Lembrar de mim": emite um token de longa duracao. */
    private Boolean lembrar;

    public LoginRequestDTO(String username, String password) {
        this.username = username;
        this.password = password;
    }

    public boolean deveLembrar() {
        return Boolean.TRUE.equals(lembrar);
    }
}
