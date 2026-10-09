package com.SistemaApiCrud.SistemaCrud.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.Clock;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import com.SistemaApiCrud.SistemaCrud.dto.CadastroDemonstracaoRequestDTO;
import com.SistemaApiCrud.SistemaCrud.repository.UsuarioRepository;

class ContaDemonstracaoLimiteIpTests {

    private final LoginAttemptStore tentativas = mock(LoginAttemptStore.class);
    private final IdentificadorProtegido identificador = mock(IdentificadorProtegido.class);

    @Test
    void limiteZeroPorIpNaoRegistraNemBloqueiaCadastros() {
        ContaDemonstracaoService service = servico(0);
        CadastroDemonstracaoRequestDTO dto = new CadastroDemonstracaoRequestDTO();
        dto.setEmail("Professor@Exemplo.com");

        for (int i = 0; i < 20; i++) {
            assertThat(service.cadastrar(dto, "127.0.0.1")).isEqualTo("professor@exemplo.com");
        }
        verifyNoInteractions(tentativas, identificador);
    }

    @Test
    void limiteNegativoPorIpContinuaInvalido() {
        assertThatThrownBy(() -> servico(-1)).isInstanceOf(IllegalStateException.class);
    }

    private ContaDemonstracaoService servico(int maximoPorIp) {
        return new ContaDemonstracaoService(
                mock(ProfessorService.class),
                mock(UsuarioRepository.class),
                tentativas,
                identificador,
                mock(TransactionTemplate.class),
                true,
                Duration.ofDays(3),
                100,
                maximoPorIp,
                Clock.systemUTC());
    }
}
