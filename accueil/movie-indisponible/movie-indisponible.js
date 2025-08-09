const params = new URLSearchParams(window.location.search);
const title = params.get("title");

if (title) {
  const titreElt = document.getElementById("titre-message");
  const texteElt = document.getElementById("texte-message");

  titreElt.textContent = `« ${title} » est indisponible`;
  texteElt.innerHTML = `Le film ou la série <strong>${title}</strong> n'est pas encore disponible sur Nayzcine.<br>Nous ferons en sorte de le rendre accessible très prochainement.`;
}
