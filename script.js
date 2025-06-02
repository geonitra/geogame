document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');
    const placeNameElement = document.getElementById('place-name');
    const startButton = document.getElementById('start-button');
    const hardModeCheckbox = document.getElementById('hard-mode-checkbox');
    const trainingModeCheckbox = document.getElementById('training-mode-checkbox');
    const nextPlaceButton = document.getElementById('next-place-button');
    const scoreDisplayElement = document.getElementById('score-display');
    const scoreTextElement = document.getElementById('score-text');
    const summaryTextElement = document.getElementById('summary-text');
    const feedbackElement = document.getElementById('feedback');
    const placeToFindCloud = document.getElementById('place-to-find-cloud');
    const trainingInfoElement = document.getElementById('training-info');
    const geojsonSelectElement = document.getElementById('geojson-select');

    let map;
    let allPlacesLayer;
    let singlePlaceLayer;

    let placesData = [];
    let currentPlaceIndex = 0;
    let score = 0;
    let gameStarted = false;
    let isHardMode = false;
    let isTrainingMode = false;
    let selectedGeoJsonFile = 'parki_narodowe.geojson';
    let selectedDatasetName = 'Parki Narodowe';

    const HARD_MODE_TOLERANCE_KM = 10;
    const MAP_FIT_BOUNDS_PADDING = 10; 
    console.log("MAP_FIT_BOUNDS_PADDING is set to:", MAP_FIT_BOUNDS_PADDING);

    function initMap() {
        if (map) {
            map.remove();
        }
        map = L.map(mapElement, { zoomControl: true }).setView([52.0693, 19.4803], 6);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);
    }

    async function loadGeoJsonData(fileName) {
        placesData = [];
        try {
            const response = await fetch(fileName);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} dla pliku ${fileName}`);
            }
            const data = await response.json();
            placesData = data.features.filter(f => f.properties && f.properties.nazwa && f.geometry);
            if (placesData.length === 0) {
                alert(`Nie udało się załadować danych z pliku ${fileName} lub plik jest pusty/niepoprawny (brak obiektów z właściwością "nazwa" i geometrią).`);
                return false;
            }
            return true;
        } catch (error) {
            console.error(`Błąd ładowania GeoJSON (${fileName}):`, error);
            alert(`Wystąpił błąd ładowania danych geograficznych z pliku ${fileName}: ` + error.message + `\nUpewnij się, że plik istnieje i jest poprawnym GeoJSON-em.`);
            return false;
        }
    }

    async function startGame() {
        const dataLoaded = await loadGeoJsonData(selectedGeoJsonFile);
        if (!dataLoaded || placesData.length === 0) {
            placeNameElement.textContent = `Błąd danych dla ${selectedDatasetName}!`;
            startButton.disabled = true;
            geojsonSelectElement.disabled = false;
            return;
        }
        startButton.disabled = false;

        isHardMode = hardModeCheckbox.checked;
        isTrainingMode = trainingModeCheckbox.checked;
        
        if (isHardMode && isTrainingMode) {
            alert("Tryb trudny i treningowy nie mogą być aktywne jednocześnie. Wybierz jeden.");
            trainingModeCheckbox.checked = false;
            isTrainingMode = false;
            return;
        }

        score = 0;
        currentPlaceIndex = 0;
        gameStarted = true;

        placesData.sort(() => Math.random() - 0.5);

        startButton.textContent = 'Zakończ Grę';
        hardModeCheckbox.parentElement.style.display = 'none';
        trainingModeCheckbox.parentElement.style.display = 'none';
        geojsonSelectElement.disabled = true;
        scoreDisplayElement.style.display = 'none';
        feedbackElement.style.visibility = 'hidden';
        feedbackElement.className = 'feedback-message';

        if (isTrainingMode) {
            placeToFindCloud.style.display = 'block';
            nextPlaceButton.style.display = 'block';
            trainingInfoElement.style.display = 'block';
            map.off('click', handleHardModeMapClick);
        } else {
            placeToFindCloud.style.display = 'block';
            nextPlaceButton.style.display = 'none';
            trainingInfoElement.style.display = 'none';
            if (isHardMode) {
                map.on('click', handleHardModeMapClick);
            } else {
                map.off('click', handleHardModeMapClick);
            }
        }
        
        clearMapLayers(); // Wyczyść warstwy przed załadowaniem nowych
        if (!map) initMap(); // Jeśli mapa nie istnieje (pierwsze uruchomienie), zainicjuj ją
        else { // Jeśli mapa istnieje, tylko zresetuj widok
            map.setView([52.0693, 19.4803], 6);
        }
        loadNextPlace();
    }

    function clearMapLayers() {
        if (allPlacesLayer) {
            map.removeLayer(allPlacesLayer);
            allPlacesLayer = null;
        }
        if (singlePlaceLayer) {
            map.removeLayer(singlePlaceLayer);
            singlePlaceLayer = null;
        }
        console.log("Map layers cleared.");
    }

    function loadNextPlace() {
        clearMapLayers(); // Upewnij się, że warstwy są czyszczone na początku każdego nowego miejsca
        feedbackElement.style.visibility = 'hidden';

        if (currentPlaceIndex >= placesData.length) {
            if (isTrainingMode) {
                console.log("Koniec trybu treningowego.");
                resetGameUI(); 
            } else {
                endGame();
            }
            return;
        }

        const currentPlace = placesData[currentPlaceIndex];
        placeNameElement.textContent = currentPlace.properties.nazwa;

        if (isTrainingMode) {
            console.log("Training Mode: Loading place:", currentPlace.properties.nazwa);
            singlePlaceLayer = L.geoJSON(currentPlace, {
                style: { color: '#28a745', weight: 3, opacity: 0.8, fillOpacity: 0.3 },
                onEachFeature: (feature, layer) => {
                    layer.bindTooltip(feature.properties.nazwa, {permanent: false, direction: 'top'});
                }
            }).addTo(map);

            if (singlePlaceLayer) {
                console.log("Training Mode: singlePlaceLayer created.");
                const bounds = singlePlaceLayer.getBounds();
                console.log("Training Mode: Bounds object:", bounds);

                if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
                    console.log("Training Mode: Bounds are valid. Fitting map with padding:", MAP_FIT_BOUNDS_PADDING);
                    map.fitBounds(bounds.pad(MAP_FIT_BOUNDS_PADDING));
                } else {
                    console.error("Training Mode: Bounds are NOT valid for", currentPlace.properties.nazwa, "Bounds object:", bounds);
                    try {
                        const centerPoint = turf.centroid(currentPlace.geometry);
                        if (centerPoint && centerPoint.geometry && centerPoint.geometry.coordinates) {
                            map.setView([centerPoint.geometry.coordinates[1], centerPoint.geometry.coordinates[0]], 10);
                            console.log("Training Mode: Fallback - set view to centroid.");
                        } else {
                             map.setView([52.0693, 19.4803], 6);
                             console.log("Training Mode: Fallback - set view to Poland.");
                        }
                    } catch (e) {
                        map.setView([52.0693, 19.4803], 6);
                        console.error("Training Mode: Error getting centroid, fallback to Poland view.", e);
                    }
                }
            } else {
                console.error("Training Mode: singlePlaceLayer was NOT created for", currentPlace.properties.nazwa);
            }
        } else if (isHardMode) {
            console.log("Hard Mode: Setting view to Poland for new question.");
            map.setView([52.0693, 19.4803], 6);
        } else { // Tryb Łatwy
            map.setView([52.0693, 19.4803], 6);
            allPlacesLayer = L.geoJSON(placesData, {
                style: { color: '#007bff', weight: 2, opacity: 0.6, fillOpacity: 0.15 },
                onEachFeature: (feature, layer) => {
                    layer.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        if (gameStarted && !isTrainingMode && !isHardMode) {
                             handleEasyModeFeatureClick(feature, layer);
                        }
                    });
                }
            }).addTo(map);
        }
    }

    function handleEasyModeFeatureClick(clickedFeature, clickedLayer) {
        if (!gameStarted || isTrainingMode || isHardMode) return;
        const targetPlace = placesData[currentPlaceIndex];
        const isCorrect = clickedFeature.properties.nazwa === targetPlace.properties.nazwa;
        processQuizAttempt(isCorrect, clickedLayer, targetPlace);
    }

    function handleHardModeMapClick(e) {
        if (!gameStarted || isTrainingMode || !isHardMode) return;
        const clickedPoint = turf.point([e.latlng.lng, e.latlng.lat]);
        const targetFeature = placesData[currentPlaceIndex];
        let center;
        try {
            center = turf.centroid(targetFeature.geometry);
        } catch (err) {
            console.warn("Nie można obliczyć centroidu dla: ", targetFeature.properties.nazwa, ". Używam pointOnFeature.");
            center = turf.pointOnFeature(targetFeature.geometry);
        }
        const distance = turf.distance(clickedPoint, center, { units: 'kilometers' });
        const isCorrect = distance <= HARD_MODE_TOLERANCE_KM;
        console.log(`Hard Mode: Clicked. Target: ${targetFeature.properties.nazwa}. Distance: ${distance.toFixed(2)}km. Correct: ${isCorrect}`);
        processQuizAttempt(isCorrect, null, targetFeature);
    }

    function processQuizAttempt(isCorrect, clickedLayerOrNull, targetPlaceFeature) {
        gameStarted = false;

        displayFeedback(isCorrect);

        if (singlePlaceLayer) { // Zawsze usuwaj starą warstwę singlePlaceLayer przed tworzeniem nowej
            map.removeLayer(singlePlaceLayer);
            singlePlaceLayer = null;
            console.log("processQuizAttempt: Old singlePlaceLayer removed.");
        }

        if (isCorrect) {
            score++;
            if (clickedLayerOrNull) { // Tryb łatwy - trafiony poligon
                clickedLayerOrNull.setStyle({ color: 'green', fillColor: 'lightgreen', weight: 3, opacity: 0.9, fillOpacity: 0.6 });
            } else { // Tryb trudny - poprawna odpowiedź (kliknięcie w tolerancji)
                singlePlaceLayer = L.geoJSON(targetPlaceFeature, { style: {color: 'green', weight:3, opacity: 0.9, fillOpacity: 0.5}}).addTo(map);
                const bounds = singlePlaceLayer.getBounds();
                if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
                    console.log("Hard mode correct: Fitting bounds with padding:", MAP_FIT_BOUNDS_PADDING);
                    map.fitBounds(bounds.pad(MAP_FIT_BOUNDS_PADDING));
                } else {
                     console.error("Hard mode correct: Bounds are NOT valid for", targetPlaceFeature.properties.nazwa, "Bounds object:", bounds);
                     map.setView([52.0693, 19.4803], 6); 
                }
            }
        } else { // Odpowiedź niepoprawna
            if (clickedLayerOrNull) { // Tryb łatwy - błędnie kliknięty poligon
                clickedLayerOrNull.setStyle({ color: 'red', fillColor: 'pink', weight: 3 });
                if (allPlacesLayer) {
                    allPlacesLayer.eachLayer(layer => {
                        if (layer.feature.properties.nazwa === targetPlaceFeature.properties.nazwa) {
                            layer.setStyle({ color: '#ff8c00', fillColor: '#ffd700', weight: 3, opacity: 0.9, fillOpacity: 0.6 });
                            const bounds = layer.getBounds();
                            if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
                                console.log("Easy mode incorrect (showing correct): Fitting bounds with padding:", MAP_FIT_BOUNDS_PADDING);
                                map.fitBounds(bounds.pad(MAP_FIT_BOUNDS_PADDING));
                            } else {
                                console.error("Easy mode incorrect (showing correct): Bounds are NOT valid for", targetPlaceFeature.properties.nazwa);
                            }
                        }
                    });
                }
            } else { // Tryb trudny - odpowiedź niepoprawna (kliknięcie poza tolerancją)
                 singlePlaceLayer = L.geoJSON(targetPlaceFeature, { style: {color: 'red', weight:3, opacity: 0.9, fillOpacity: 0.5}}).addTo(map);
                 const bounds = singlePlaceLayer.getBounds();
                 if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
                    console.log("Hard mode incorrect: Fitting bounds with padding:", MAP_FIT_BOUNDS_PADDING);
                    map.fitBounds(bounds.pad(MAP_FIT_BOUNDS_PADDING));
                } else {
                    console.error("Hard mode incorrect: Bounds are NOT valid for", targetPlaceFeature.properties.nazwa, "Bounds object:", bounds);
                    map.setView([52.0693, 19.4803], 6);
                }
            }
        }

        setTimeout(() => {
            currentPlaceIndex++;
            gameStarted = true;
            
            if (!isTrainingMode) {
                 if (!isHardMode) { // Tylko w trybie łatwym resetuj widok tutaj
                    map.setView([52.0693, 19.4803], 6);
                 }
                 // W trybie trudnym, loadNextPlace() i tak ustawi widok na Polskę
            }
            loadNextPlace(); // To powinno zająć się wyczyszczeniem singlePlaceLayer jeśli trzeba
        }, isCorrect ? 2000 : 3500);
    }

    function displayFeedback(correct) {
        feedbackElement.className = 'feedback-message';
        void feedbackElement.offsetWidth; 

        if (correct) {
            feedbackElement.textContent = 'Dobrze!';
            feedbackElement.classList.add('correct');
        } else {
            feedbackElement.textContent = 'Pudło!';
            feedbackElement.classList.add('incorrect');
        }
    }
    
    function handleNextButton() {
        if (!isTrainingMode || !gameStarted) return;
        currentPlaceIndex++;
        loadNextPlace();
    }

    function endGame() {
        gameStarted = false;
        clearMapLayers();
        if (map) map.off('click', handleHardModeMapClick);

        const percentage = placesData.length > 0 ? (score / placesData.length) * 100 : 0;
        scoreTextElement.textContent = `${percentage.toFixed(1)}%`;
        summaryTextElement.textContent = `Poprawnie wskazano ${score} z ${placesData.length} miejsc (${selectedDatasetName}).`;

        placeToFindCloud.style.display = 'none';
        scoreDisplayElement.style.display = 'block';
        
        resetGameUI(true);
    }
    
    function resetGameUI(gameTrulyEnded = false) {
        gameStarted = false;
        clearMapLayers();
        if (map) {
            map.off('click', handleHardModeMapClick);
            // Reset widoku mapy, jeśli gra jest resetowana do ekranu startowego
            if (!gameStarted) map.setView([52.0693, 19.4803], 6);
        }


        startButton.textContent = 'Start';
        hardModeCheckbox.parentElement.style.display = 'block';
        trainingModeCheckbox.parentElement.style.display = 'block';
        geojsonSelectElement.disabled = false;
        
        if (!gameTrulyEnded) {
            trainingModeCheckbox.checked = false;
            hardModeCheckbox.checked = false;
        }

        placeToFindCloud.style.display = 'block';
        placeNameElement.textContent = `Gotowy na ${selectedDatasetName}?`;
        nextPlaceButton.style.display = 'none';
        trainingInfoElement.style.display = 'none';
        if (!gameTrulyEnded) {
            scoreDisplayElement.style.display = 'none';
        }
        feedbackElement.style.visibility = 'hidden';
        startButton.disabled = false;
    }

    function setupEventListeners() {
        startButton.addEventListener('click', () => {
            if (gameStarted) {
                if (isTrainingMode) {
                    console.log("Tryb treningowy zakończony przez użytkownika.");
                    resetGameUI();
                } else {
                    endGame();
                }
            } else {
                if (!map) initMap();
                startGame();
            }
        });
        nextPlaceButton.addEventListener('click', handleNextButton);

        hardModeCheckbox.addEventListener('change', function() {
            if (this.checked && trainingModeCheckbox.checked) {
                trainingModeCheckbox.checked = false;
            }
        });
        trainingModeCheckbox.addEventListener('change', function() {
            if (this.checked && hardModeCheckbox.checked) {
                hardModeCheckbox.checked = false;
            }
        });

        geojsonSelectElement.addEventListener('change', async (event) => {
            selectedGeoJsonFile = event.target.value;
            const selectedOption = event.target.options[event.target.selectedIndex];
            selectedDatasetName = selectedOption.dataset.name || selectedOption.text;
            
            console.log(`Wybrano zestaw: ${selectedDatasetName} (plik: ${selectedGeoJsonFile})`);
            
            if (gameStarted) { // Jeśli gra jest w toku, zresetuj ją przed zmianą danych
                resetGameUI(); 
            }
            
            startButton.disabled = true;
            placeNameElement.textContent = `Ładowanie ${selectedDatasetName}...`;
            const dataLoaded = await loadGeoJsonData(selectedGeoJsonFile);
            if (dataLoaded && placesData.length > 0) {
                placeNameElement.textContent = `Gotowy na ${selectedDatasetName}? (${placesData.length} miejsc)`;
                startButton.disabled = false;
            } else {
                placeNameElement.textContent = `Błąd ładowania ${selectedDatasetName}! Wybierz inny.`;
                startButton.disabled = true;
            }
        });
    }

    async function initializeApp() {
        initMap();
        
        selectedGeoJsonFile = geojsonSelectElement.value;
        const firstOption = geojsonSelectElement.options[geojsonSelectElement.selectedIndex];
        selectedDatasetName = firstOption.dataset.name || firstOption.text;
        
        setupEventListeners();

        // Wywołaj event 'change' ręcznie, aby załadować dane dla domyślnego zestawu
        const initialLoadEvent = new Event('change');
        geojsonSelectElement.dispatchEvent(initialLoadEvent);
    }

    initializeApp();
});