package com.SistemaApiCrud.SistemaCrud.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.SistemaApiCrud.SistemaCrud.dto.CadastroDemonstracaoRequestDTO;
import com.SistemaApiCrud.SistemaCrud.dto.LoginRequestDTO;
import com.SistemaApiCrud.SistemaCrud.dto.LoginResponseDTO;
import com.SistemaApiCrud.SistemaCrud.dto.StatusDemonstracaoDTO;
import com.SistemaApiCrud.SistemaCrud.entity.Usuario;
import com.SistemaApiCrud.SistemaCrud.mapper.UsuarioMapper;
import com.SistemaApiCrud.SistemaCrud.service.ContaDemonstracaoService;
import com.SistemaApiCrud.SistemaCrud.service.JwtService;
import com.SistemaApiCrud.SistemaCrud.service.LoginAttemptService;
import com.SistemaApiCrud.SistemaCrud.service.UsuarioService;

import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/auth")
public class AuthenticationController {

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final UsuarioService usuarioService;
    private final UsuarioMapper usuarioMapper;
    private final LoginAttemptService loginAttemptService;
    private final ContaDemonstracaoService contaDemonstracaoService;

    public AuthenticationController(
            AuthenticationManager authenticationManager,
            JwtService jwtService,
            UsuarioService usuarioService,
            UsuarioMapper usuarioMapper,
            LoginAttemptService loginAttemptService,
            ContaDemonstracaoService contaDemonstracaoService) {
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.usuarioService = usuarioService;
        this.usuarioMapper = usuarioMapper;
        this.loginAttemptService = loginAttemptService;
        this.contaDemonstracaoService = contaDemonstracaoService;
    }

    @GetMapping("/demonstracao")
    public ResponseEntity<StatusDemonstracaoDTO> statusDemonstracao() {
        return ResponseEntity.ok(contaDemonstracaoService.status());
    }

    @PostMapping("/demonstracao/cadastro")
    public ResponseEntity<LoginResponseDTO> cadastrarDemonstracao(
            @RequestBody @Valid CadastroDemonstracaoRequestDTO request,
            HttpServletRequest httpRequest) {
        String username = contaDemonstracaoService.cadastrar(request, httpRequest.getRemoteAddr());
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(username, request.getSenha()));
        Usuario usuario = usuarioService.buscarPorUsername(authentication.getName());
        String token = jwtService.gerarToken(authentication, usuario);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(usuarioMapper.toLoginResponse(token, jwtService.getExpiraEm(token), usuario));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponseDTO> login(
            @RequestBody @Valid LoginRequestDTO request,
            HttpServletRequest httpRequest) {
        String remoteAddress = httpRequest.getRemoteAddr();
        // Contas do cadastro completo usam o e-mail em minusculas como usuario de acesso.
        String username = request.getUsername().contains("@")
                ? ContaDemonstracaoService.normalizarEmail(request.getUsername())
                : request.getUsername();
        loginAttemptService.validarPermitido(username, remoteAddress);

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(username, request.getPassword()));
        } catch (AuthenticationException ex) {
            loginAttemptService.registrarFalha(username, remoteAddress);
            throw ex;
        }

        loginAttemptService.registrarSucesso(username);
        Usuario usuario = usuarioService.buscarPorUsername(authentication.getName());
        String token = jwtService.gerarToken(authentication, usuario, request.deveLembrar());
        return ResponseEntity.ok(usuarioMapper.toLoginResponse(token, jwtService.getExpiraEm(token), usuario));
    }
}
