package com.SistemaApiCrud.SistemaCrud;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import com.SistemaApiCrud.SistemaCrud.entity.Professor;
import com.SistemaApiCrud.SistemaCrud.entity.Usuario;
import com.SistemaApiCrud.SistemaCrud.entity.enums.PapelUsuario;
import com.SistemaApiCrud.SistemaCrud.repository.UsuarioRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest(properties = {
        "app.demo.cadastro.habilitado=true",
        "app.demo.cadastro.validade=2d",
        "app.demo.cadastro.maximo-cadastros-por-ip=3"
})
@AutoConfigureMockMvc
class ContaDemonstracaoIntegrationTests {

    private static final String SENHA = "senhaDemo123";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UsuarioRepository usuarioRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void informaQueCadastroEstaHabilitadoSemAutenticacao() throws Exception {
        mockMvc.perform(get("/auth/demonstracao"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cadastroHabilitado").value(true))
                .andExpect(jsonPath("$.validadeHoras").value(48));
    }

    @Test
    @Transactional
    void criaProfessorComEmailComoUsuarioDeAcesso() throws Exception {
        String resposta = mockMvc.perform(cadastro("10.0.0.1", corpo("Ana.Demo1@Exemplo.edu")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("PROFESSOR"))
                .andExpect(jsonPath("$.idProfessor").isNumber())
                .andReturn().getResponse().getContentAsString();

        Usuario usuario = usuarioRepository.findByUsername("ana.demo1@exemplo.edu").orElseThrow();
        assertThat(usuario.getRole()).isEqualTo(PapelUsuario.PROFESSOR);
        assertThat(usuario.getContaDemonstracao()).isTrue();
        assertThat(usuario.getDemonstracaoExpiraEm()).isAfter(Instant.now().plusSeconds(47 * 3600));
        Professor professor = usuario.getProfessor();
        assertThat(professor.getNome()).isEqualTo("Ana Martins");
        assertThat(professor.getMateria()).isEqualTo("Fisioterapia");
        assertThat(professor.getCargo()).isEqualTo("Preceptor");

        JsonNode login = objectMapper.readTree(resposta);
        mockMvc.perform(get("/professores/" + login.get("idProfessor").asLong())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + login.get("token").asText()))
                .andExpect(status().isOk());

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "ANA.demo1@exemplo.edu",
                                "password", SENHA))))
                .andExpect(status().isOk());
    }

    @Test
    void contaExpiradaNaoConsegueEntrarNemUsarTokenAntigo() throws Exception {
        String resposta = mockMvc.perform(cadastro("10.0.0.2", corpo("demo2@exemplo.edu")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode login = objectMapper.readTree(resposta);

        Usuario usuario = usuarioRepository.findByUsername("demo2@exemplo.edu").orElseThrow();
        usuario.setDemonstracaoExpiraEm(Instant.now().minusSeconds(1));
        usuarioRepository.save(usuario);

        mockMvc.perform(get("/professores/" + login.get("idProfessor").asLong())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + login.get("token").asText()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "demo2@exemplo.edu",
                                "password", SENHA))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void naoPermiteEmailDuplicado() throws Exception {
        mockMvc.perform(cadastro("10.0.0.3", corpo("demo3@exemplo.edu")))
                .andExpect(status().isCreated());
        mockMvc.perform(cadastro("10.0.0.3", corpo("DEMO3@exemplo.edu")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void exigeSenhaComLetrasENumerosEAceiteDosTermos() throws Exception {
        Map<String, Object> semNumeros = corpo("demo4@exemplo.edu");
        semNumeros.put("senha", "somenteletras");
        mockMvc.perform(cadastro("10.0.0.4", semNumeros))
                .andExpect(status().isBadRequest());

        Map<String, Object> semAceite = corpo("demo5@exemplo.edu");
        semAceite.put("aceiteTermos", false);
        mockMvc.perform(cadastro("10.0.0.4", semAceite))
                .andExpect(status().isBadRequest());

        assertThat(usuarioRepository.findByUsername("demo4@exemplo.edu")).isEmpty();
        assertThat(usuarioRepository.findByUsername("demo5@exemplo.edu")).isEmpty();
    }

    @Test
    void bloqueiaIpAposLimiteDeCadastros() throws Exception {
        for (int indice = 0; indice < 3; indice++) {
            mockMvc.perform(cadastro("203.0.113.40", corpo("lote" + indice + "@exemplo.edu")))
                    .andExpect(status().isCreated());
        }

        mockMvc.perform(cadastro("203.0.113.40", corpo("lote9@exemplo.edu")))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));

        assertThat(usuarioRepository.findByUsername("lote9@exemplo.edu")).isEmpty();
    }

    private MockHttpServletRequestBuilder cadastro(String ip, Map<String, Object> corpo) throws Exception {
        return post("/auth/demonstracao/cadastro")
                .with(requisicao -> {
                    requisicao.setRemoteAddr(ip);
                    return requisicao;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(corpo));
    }

    private static Map<String, Object> corpo(String email) {
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("nome", "Ana");
        corpo.put("sobrenome", "Martins");
        corpo.put("email", email);
        corpo.put("senha", SENHA);
        corpo.put("areaAtuacao", "Fisioterapia");
        corpo.put("cargo", "Preceptor");
        corpo.put("aceiteTermos", true);
        return corpo;
    }
}
