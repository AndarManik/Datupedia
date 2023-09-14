async function loadData() {
    const pageName = window.location.pathname.split('/')[1];
    
    const fetchedData = await fetch(`/${pageName}/fetchData`).then(res => res.json());
    const clusterData = await fetch(`/${pageName}/clusterData`).then(res => res.json());
    const synthesizedArticle = await fetch(`/${pageName}/synthesizeArticle`).then(res => res.json());
  
    document.getElementById('fetchedData').innerHTML = fetchedData.html;
    document.getElementById('clusterData').innerHTML = clusterData.html;
    document.getElementById('synthesizedArticle').innerHTML = synthesizedArticle.html;
  }
  
  loadData();
  