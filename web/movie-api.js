// ============================================================
//  movie-api.js — Integração CineVoto com TMDb e OMDb
//  Busca de sinopses (pt-BR), pôsteres, trailers do YouTube e notas
// ============================================================

import { tmdbConfig, omdbConfig } from './firebase-config.js';

/** Recupera a chave da API TMDb (localStorage tem prioridade sobre o config) */
export function getTmdbKey() {
    return (localStorage.getItem('cinevoto_tmdb_key') || tmdbConfig?.apiKey || '').trim();
}

/** Recupera a chave da API OMDb (localStorage tem prioridade sobre o config) */
export function getOmdbKey() {
    return (localStorage.getItem('cinevoto_omdb_key') || omdbConfig?.apiKey || '').trim();
}

/** Salva as chaves no localStorage do navegador */
export function salvarChavesApi(tmdbKey, omdbKey) {
    if (tmdbKey !== undefined) localStorage.setItem('cinevoto_tmdb_key', tmdbKey.trim());
    if (omdbKey !== undefined) localStorage.setItem('cinevoto_omdb_key', omdbKey.trim());
}

/**
 * Testa as credenciais do TMDb e OMDb buscando o filme "A Origem" (Inception)
 */
export async function testarApis(tmdbKey, omdbKey) {
    const resultado = {
        tmdbOk: false,
        tmdbMsg: '',
        omdbOk: false,
        omdbMsg: ''
    };

    if (tmdbKey) {
        try {
            const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=Inception&language=pt-BR`);
            const data = await res.json();
            if (res.ok && data.results) {
                resultado.tmdbOk = true;
                resultado.tmdbMsg = `TMDb Conectado com sucesso! (Encontrado: "${data.results[0]?.title || 'OK'}")`;
            } else {
                resultado.tmdbMsg = data.status_message || 'Chave TMDb inválida.';
            }
        } catch (e) {
            resultado.tmdbMsg = 'Erro de rede ao conectar com TMDb.';
        }
    } else {
        resultado.tmdbMsg = 'Chave TMDb não informada.';
    }

    if (omdbKey) {
        try {
            const res = await fetch(`https://www.omdbapi.com/?apikey=${omdbKey}&i=tt1375666`);
            const data = await res.json();
            if (data.Response === 'True') {
                resultado.omdbOk = true;
                resultado.omdbMsg = `OMDb Conectado com sucesso! (Nota IMDb: ${data.imdbRating || 'N/A'})`;
            } else {
                resultado.omdbMsg = data.Error || 'Chave OMDb inválida.';
            }
        } catch (e) {
            resultado.omdbMsg = 'Erro de rede ao conectar com OMDb.';
        }
    } else {
        resultado.omdbMsg = 'Chave OMDb não informada.';
    }

    return resultado;
}

/**
 * Busca dados completos de um filme por título:
 * - TMDb: Pôster oficial, título nacional, sinopse estritamente em pt-BR e trailer do YouTube.
 * - OMDb: Avaliações do IMDb, Rotten Tomatoes (🍅) e Metacritic.
 */
export async function buscarDadosFilme(tituloOriginal) {
    const defaultData = {
        titulo: tituloOriginal,
        tituloPt: tituloOriginal,
        tituloOriginal: '',
        ano: '',
        sinopse: '',
        posterUrl: '',
        backdropUrl: '',
        generos: [],
        duracao: '',
        imdbId: '',
        imdbRating: '',
        rottenTomatoes: '',
        metascore: '',
        trailerKey: '',
        trailerUrl: ''
    };

    const tmdbKey = getTmdbKey();
    if (!tmdbKey) {
        return defaultData;
    }

    try {
        // 1. Busca filme pelo título em pt-BR
        const query = encodeURIComponent(tituloOriginal.trim());
        const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${query}&language=pt-BR&include_adult=false`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return defaultData;

        const searchData = await searchRes.json();
        if (!searchData.results || searchData.results.length === 0) {
            return defaultData;
        }

        const movieMatch = searchData.results[0];
        const movieId = movieMatch.id;

        // 2. Busca detalhes completos com vídeos (trailers)
        const detailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${tmdbKey}&language=pt-BR&append_to_response=videos`;
        const detailsRes = await fetch(detailsUrl);
        if (!detailsRes.ok) return defaultData;

        const details = await detailsRes.json();

        // Sinopse estritamente em Português do Brasil:
        let sinopsePt = (details.overview || '').trim();
        if (!sinopsePt) {
            sinopsePt = 'Sinopse não disponível em português.';
        }

        // Mapeamento do trailer no YouTube (prioriza trailer em pt-BR, depois qualquer trailer oficial no YouTube)
        let trailerKey = '';
        const videos = details.videos?.results || [];
        const trailerPt = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && (v.iso_639_1 === 'pt' || v.iso_3166_1 === 'BR'));
        const trailerAny = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer');
        const videoYoutube = videos.find(v => v.site === 'YouTube');

        const videoEscolhido = trailerPt || trailerAny || videoYoutube;
        if (videoEscolhido) {
            trailerKey = videoEscolhido.key;
        }

        // 3. Notas do OMDb (se a chave OMDb estiver configurada e o filme tiver imdb_id)
        let imdbRating = details.vote_average ? details.vote_average.toFixed(1) : '';
        let rottenTomatoes = '';
        let metascore = '';

        const omdbKey = getOmdbKey();
        if (omdbKey && details.imdb_id) {
            try {
                const omdbUrl = `https://www.omdbapi.com/?apikey=${omdbKey}&i=${details.imdb_id}`;
                const omdbRes = await fetch(omdbUrl);
                if (omdbRes.ok) {
                    const omdbData = await omdbRes.json();
                    if (omdbData.Response === 'True') {
                        if (omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
                            imdbRating = omdbData.imdbRating;
                        }
                        const rt = (omdbData.Ratings || []).find(r => r.Source === 'Rotten Tomatoes');
                        if (rt && rt.Value) {
                            rottenTomatoes = rt.Value;
                        }
                        if (omdbData.Metascore && omdbData.Metascore !== 'N/A') {
                            metascore = omdbData.Metascore;
                        }
                    }
                }
            } catch (errOmdb) {
                console.warn('Erro ao consultar OMDb:', errOmdb);
            }
        }

        // Pôster oficial
        const posterPath = details.poster_path || movieMatch.poster_path;
        const backdropPath = details.backdrop_path || movieMatch.backdrop_path;

        return {
            titulo: tituloOriginal,
            tituloPt: details.title || movieMatch.title || tituloOriginal,
            tituloOriginal: details.original_title || movieMatch.original_title || '',
            ano: (details.release_date || movieMatch.release_date || '').substring(0, 4),
            sinopse: sinopsePt,
            posterUrl: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : '',
            backdropUrl: backdropPath ? `https://image.tmdb.org/t/p/w1280${backdropPath}` : '',
            generos: (details.genres || []).map(g => g.name).slice(0, 3),
            duracao: details.runtime ? `${details.runtime} min` : '',
            imdbId: details.imdb_id || '',
            imdbRating: imdbRating,
            rottenTomatoes: rottenTomatoes,
            metascore: metascore,
            trailerKey: trailerKey,
            trailerUrl: trailerKey ? `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1` : ''
        };

    } catch (err) {
        console.warn('Erro ao consultar TMDb para filme:', tituloOriginal, err);
        return defaultData;
    }
}
